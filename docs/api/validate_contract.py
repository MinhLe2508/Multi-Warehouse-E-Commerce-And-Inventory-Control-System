"""Validate the live OpenAPI contracts and examples.

Usage: python docs/api/validate_contract.py [--source .] [--report PATH]
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from decimal import Decimal
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

try:
    import yaml
    from openapi_schema_validator import OAS30Validator
    from openapi_spec_validator import validate_spec
except ImportError:
    raise SystemExit("Cài thư viện bằng python -m pip install -r docs/api/requirements-validation.txt")


ROOT = Path(__file__).resolve().parent
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
CUSTOMER_CONTROLLERS = (
    "backend/src/orders/orders.controller.ts",
    "backend/src/payments/payments.controller.ts",
)


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def mapping_without_duplicates(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "trong cùng một mapping", node.start_mark, f"YAML có key trùng: {key!r}", key_node.start_mark
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping_without_duplicates)


def load_spec(filename: str) -> dict:
    with (ROOT / filename).open(encoding="utf-8") as stream:
        spec = yaml.load(stream, Loader=UniqueKeyLoader)
    if not isinstance(spec, dict) or spec.get("openapi") != "3.0.3":
        raise ValueError(f"{filename} phải dùng OpenAPI 3.0.3")
    try:
        validate_spec(spec)
    except Exception as error:
        raise ValueError(f"{filename}: {error}") from error
    return spec


def expand(spec: dict, value):
    if isinstance(value, list):
        return [expand(spec, item) for item in value]
    if not isinstance(value, dict):
        return value
    if "$ref" not in value:
        return {key: expand(spec, item) for key, item in value.items()}
    reference = value["$ref"]
    assert len(value) == 1 and reference.startswith("#/"), f"Tham chiếu không hợp lệ: {reference}"
    resolved = spec
    for part in reference[2:].split("/"):
        resolved = resolved[part.replace("~1", "/").replace("~0", "~")]
    return expand(spec, resolved)


def schema_validator(spec, schema):
    return OAS30Validator(expand(spec, schema), format_checker=OAS30Validator.FORMAT_CHECKER)


def operations(spec):
    return [(path, method, operation) for path, item in spec["paths"].items()
            for method, operation in item.items() if method in HTTP_METHODS]


def customer_fixtures(spec):
    fixtures = []
    operation_ids = set()
    for path, method, operation in operations(spec):
        name = operation["operationId"]
        assert name not in operation_ids, f"Trùng operationId: {name}"
        operation_ids.add(name)
        assert operation.get("security", spec["security"]) == [{"bearerAuth": []}]
        parameters = [expand(spec, param) for param in operation.get("parameters", [])]
        assert set(re.findall(r"{([^}]+)}", path)) == {
            p["name"] for p in parameters if p["in"] == "path" and p["required"]
        }

        def add_fixtures(kind, media, status=None):
            for scenario, example in media["examples"].items():
                value = example["value"]
                schema_validator(spec, media["schema"]).validate(value)
                fixture = {"operationId": name, "kind": kind}
                if status is not None:
                    fixture["status"] = status
                fixture.update(scenario=scenario, schema=media["schema"]["$ref"], value=value)
                if isinstance(value, dict) and "statusCode" in value:
                    assert value["statusCode"] == status == spec["x-error-status-map"][value["code"]]
                fixtures.append(fixture)
                if isinstance(value, dict) and {"subtotal", "discountTotal", "shippingFee", "grandTotal"} <= value.keys():
                    assert Decimal(value["grandTotal"]) == (
                        Decimal(value["subtotal"]) - Decimal(value["discountTotal"]) + Decimal(value["shippingFee"])
                    )
                    for item in value["items"]:
                        assert Decimal(item["lineTotal"]) == (
                            Decimal(item["unitPrice"]) * item["quantity"] - Decimal(item["discountAmount"])
                        )

        if "requestBody" in operation:
            add_fixtures("request", operation["requestBody"]["content"]["application/json"])
        for status, response in operation["responses"].items():
            add_fixtures("response", response["content"]["application/json"], int(status))
        assert {"400", "401", "403"} <= operation["responses"].keys(), (method, path)
    return fixtures


def validate_negative_cases(spec, fixtures):
    order = next(f["value"] for f in fixtures if f["operationId"] == "createOrder" and f["kind"] == "request")
    mock = next(f["value"] for f in fixtures if f["operationId"] == "payMockOrder" and f["kind"] == "request")
    bad = [
        ("CreateOrderRequest", {**order, "userId": "injected"}),
        ("CreateOrderRequest", {**order, "items": []}),
        ("MockPaymentRequest", {**mock, "method": "COD"}),
        ("MockPaymentRequest", {**mock, "approved": "true"}),
        ("MockPaymentRequest", {**mock, "amount": "1.00"}),
        ("MockPaymentRequest", {**mock, "transactionRef": "invalid ref"}),
        ("Money", 1000),
        ("Money", "1.001"),
        ("Money", "-1.00"),
        ("BigIntId", 9007199254740993),
    ]
    for quantity in (0, -1, 1.5, 101):
        request = deepcopy(order)
        request["items"][0]["quantity"] = quantity
        bad.append(("CreateOrderRequest", request))
    for name, value in bad:
        schema = spec["components"]["schemas"][name]
        assert not schema_validator(spec, schema).is_valid(value), f"Schema {name} chấp nhận dữ liệu sai"
    schema_validator(spec, spec["components"]["schemas"]["BigIntId"]).validate("9007199254740993")
    return len(bad)


def validate_source(spec, root: Path):
    actual = set()
    for filename in CUSTOMER_CONTROLLERS:
        text = (root / filename).read_text(encoding="utf-8")
        base = re.search(r"@Controller\('([^']+)'\)", text).group(1)
        for method, suffix in re.findall(r"@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)", text):
            path = f"/{base}/{suffix}".rstrip("/")
            path = re.sub(r":(\w+)", r"{\1}", path)
            actual.add((path, method.lower()))
    listed = {(path, method) for path, method, _ in operations(spec)}
    assert listed == actual, f"Route khách hàng lệch source. Chỉ trong spec={listed - actual}. Chỉ trong source={actual - listed}."

    prisma = (root / "backend/prisma/schema.prisma").read_text(encoding="utf-8")
    for enum in ("OrderStatus", "ReservationStatus", "PaymentStatus", "PaymentMethod"):
        block = re.search(r"enum\s+" + enum + r"\s*{([^}]+)}", prisma).group(1)
        values = [line.split("//")[0].strip() for line in block.splitlines() if line.split("//")[0].strip()]
        assert values == spec["components"]["schemas"][enum]["enum"], f"Enum lệch: {enum}"
    internal = spec["x-internal-stock-reservation"]
    sql = (root / internal["sourceFile"]).read_text(encoding="utf-8")
    signature = re.search(r"FUNCTION\s+(fn_reserve_stock\s*\([^)]*\)\s*RETURNS\s+BIGINT)", sql, re.I).group(1)
    def normalized(value):
        return re.sub(r"\s+", "", value).lower()
    assert normalized(signature) == normalized(internal["sqlSignature"]), "Chữ ký hàm giữ chỗ lệch source"
    assert "uq_payments_one_success_per_order" in sql


def run(source: Path | None, report: Path | None):
    filenames = ("openapi.yaml", "admin-api-contract.yaml")
    public, admin = [load_spec(filename) for filename in filenames]
    fixtures = customer_fixtures(public)
    saved_fixtures = json.loads((ROOT / "examples.json").read_text(encoding="utf-8"))["fixtures"]
    assert fixtures == saved_fixtures, "examples.json lệch với ví dụ trong OpenAPI"
    invalid = validate_negative_cases(public, fixtures)
    internal = public["x-internal-stock-reservation"]
    schema_validator(public, {"$ref": internal["schemaReference"]}).validate(internal["example"])
    assert internal["publicHttpEndpoint"] is False

    checks = [
        f"{filename} · OpenAPI 3.0.3 · {len(operations(spec))} thao tác · YAML không có key trùng"
        for filename, spec in zip(filenames, (public, admin))
    ]
    checks.append(f"{len(fixtures)} ví dụ hợp lệ và {invalid} mẫu sai bị từ chối")
    if source is not None:
        validate_source(public, source.resolve())
        checks.append("Route khách hàng, enum Prisma và chữ ký fn_reserve_stock khớp source")
    for check in checks:
        print(f"PASS — {check}")
    if report:
        lines = ["# Kiểm tra hợp đồng API", "", *[f"- PASS — {check}" for check in checks], ""]
        for filename in filenames:
            digest = sha256((ROOT / filename).read_bytes()).hexdigest()
            lines.append(f"- `{filename}` SHA-256 `{digest}`")
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        run(args.source, args.report)
    except Exception as error:
        print(f"FAIL — {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
