"""Kiểm tra tài liệu; không gọi API, migrate, seed hoặc sửa source dự án.

Chạy: python docs/api/validate_contract.py [--source .] [--report PATH]
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import sys

try:
    import yaml
    from openapi_spec_validator import validate_spec
    from openapi_schema_validator import OAS30Validator
except ImportError:
    raise SystemExit("Thiếu thư viện. Cài: python -m pip install -r docs/api/requirements-validation.txt")


ROOT = Path(__file__).resolve().parent
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def mapping_without_duplicates(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f"YAML có key trùng: {key!r}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping_without_duplicates)


def run(source: Path | None, report_path: Path | None) -> None:
    spec = yaml.load((ROOT / "openapi.yaml").read_text(encoding="utf-8"), Loader=UniqueKeyLoader)
    validate_spec(spec)
    checks = [("OpenAPI 3.0.3, YAML không key trùng và cấu trúc chuẩn", "PASS")]
    assert spec["openapi"] == "3.0.3"

    references = set()

    def resolve(reference):
        assert reference.startswith("#/"), f"Chỉ dùng local ref: {reference}"
        value = spec
        for part in reference[2:].split("/"):
            value = value[part.replace("~1", "/").replace("~0", "~")]
        references.add(reference)
        return value

    def expand(value):
        if isinstance(value, dict):
            if "$ref" in value:
                assert len(value) == 1, "Không đặt field cạnh $ref trong OpenAPI 3.0"
                return expand(resolve(value["$ref"]))
            return {k: expand(v) for k, v in value.items()}
        if isinstance(value, list):
            return [expand(v) for v in value]
        return value

    expand(spec)

    def validator(schema):
        return OAS30Validator(expand(schema), format_checker=OAS30Validator.FORMAT_CHECKER)

    operations = {}
    expected_fixtures = []
    for path, path_item in spec["paths"].items():
        for method, op in path_item.items():
            if method not in HTTP_METHODS:
                continue
            op_id = op["operationId"]
            assert op_id not in operations, f"Trùng operationId: {op_id}"
            operations[op_id] = op
            params = path_item.get("parameters", []) + op.get("parameters", [])
            assert set(re.findall(r"{([^}]+)}", path)) == {p["name"] for p in params if p["in"] == "path" and p["required"]}
            for requirement in op["security"]:
                for scheme in requirement:
                    assert scheme in spec["components"]["securitySchemes"]
            media = op.get("requestBody", {}).get("content", {}).get("application/json")
            if media:
                for name, sample in media["examples"].items():
                    validator(media["schema"]).validate(sample["value"])
                    expected_fixtures.append({"operationId": op_id, "kind": "request", "scenario": name, "schema": media["schema"]["$ref"], "value": sample["value"]})
            for status, response in op["responses"].items():
                media = response["content"]["application/json"]
                for name, sample in media["examples"].items():
                    validator(media["schema"]).validate(sample["value"])
                    value = sample["value"]
                    if "statusCode" in value:
                        assert value["statusCode"] == int(status)
                        assert spec["x-error-status-map"][value["code"]] == int(status)
                    expected_fixtures.append({"operationId": op_id, "kind": "response", "status": int(status), "scenario": name, "schema": media["schema"]["$ref"], "value": value})
    fixtures = json.loads((ROOT / "examples.json").read_text(encoding="utf-8"))["fixtures"]
    assert fixtures == expected_fixtures, "examples.json lệch với examples trong OpenAPI"
    checks.append((f"{len(operations)} operationId riêng, path parameters, security schemes và {len(references)} local refs", "PASS"))
    checks.append((f"{len(fixtures)} fixture request/response khớp schema và OpenAPI; lỗi khớp HTTP status", "PASS"))

    # Kiểm tra tác động trực tiếp của cập nhật nhóm 09/10.
    customer_operations = 0
    for op_id, op in operations.items():
        if op["security"] == [{"bearerAuth": []}]:
            customer_operations += 1
            examples_403 = op["responses"]["403"]["content"]["application/json"]["examples"]
            for code in ["PASSWORD_CHANGE_REQUIRED", "ACCOUNT_INACTIVE", "FORBIDDEN"]:
                assert examples_403[code]["value"]["code"] == code
            assert "đổi mật khẩu" in op["description"]
        else:
            assert op_id == "processMockPaymentCallback"
            assert op["security"] == [{"mockCallbackToken": []}]
            assert "403" not in op["responses"], "Không áp guard đổi mật khẩu Customer cho callback server"
    assert customer_operations == 6
    assert spec["x-team-update-date"] == "2026-10-09"
    checks.append(("Cả 6 operation khách có lỗi bắt đổi mật khẩu; callback dùng quyền server riêng", "PASS"))

    base_request = next(f["value"] for f in fixtures if f["operationId"] == "createOrder" and f["kind"] == "request")
    negative = []
    for value in [0, -1, 1.5, 101]:
        bad = deepcopy(base_request)
        bad["items"][0]["quantity"] = value
        negative.append(("CreateOrderRequest", bad))
    bad = deepcopy(base_request); bad["items"] = []
    negative.append(("CreateOrderRequest", bad))
    bad = deepcopy(base_request); bad["items"][0]["productId"] = "not-a-uuid"
    negative.append(("CreateOrderRequest", bad))
    bad = deepcopy(base_request); bad["userId"] = "injected-owner"
    negative.append(("CreateOrderRequest", bad))
    bad = deepcopy(base_request); bad.pop("shippingAddress")
    negative.append(("CreateOrderRequest", bad))
    negative += [("Money", 1000), ("Money", "1.001"), ("Money", "-1.00"), ("PositiveMoney", "0.00"),
                 ("BigIntId", 9007199254740993), ("OrderStatus", "PAID"), ("PaymentStatus", "COMPLETED")]
    for schema, value in negative:
        assert not validator({"$ref": "#/components/schemas/" + schema}).is_valid(value), f"Không chặn mẫu sai: {schema}: {value}"
    validator({"$ref": "#/components/schemas/BigIntId"}).validate("9007199254740993")
    checks.append((f"{len(negative)} mẫu sai bị schema từ chối; BIGINT > 2^53 dạng chuỗi được giữ", "PASS"))

    def inspect_value(value):
        if isinstance(value, list):
            for v in value: inspect_value(v)
        elif isinstance(value, dict):
            if all(k in value for k in ["subtotal", "discountTotal", "shippingFee", "grandTotal", "items"]):
                assert Decimal(value["grandTotal"]) == Decimal(value["subtotal"]) - Decimal(value["discountTotal"]) + Decimal(value["shippingFee"])
                assert sum(Decimal(i["unitPrice"]) * i["quantity"] for i in value["items"]) == Decimal(value["subtotal"])
                assert sum(Decimal(i["discountAmount"]) for i in value["items"]) == Decimal(value["discountTotal"])
                assert sum(Decimal(i["lineTotal"]) for i in value["items"]) == Decimal(value["grandTotal"]) - Decimal(value["shippingFee"])
            if all(k in value for k in ["quantity", "unitPrice", "discountAmount", "lineTotal"]):
                assert Decimal(value["lineTotal"]) == Decimal(value["unitPrice"]) * value["quantity"] - Decimal(value["discountAmount"])
            if "pagination" in value:
                page = value["pagination"]
                assert page["totalPages"] == (page["totalItems"] + page["pageSize"] - 1) // page["pageSize"]
                assert len(value["items"]) <= page["pageSize"]
            for v in value.values(): inspect_value(v)
    for f in fixtures: inspect_value(f["value"])
    internal = spec["x-internal-stock-reservation"]
    validator({"$ref": internal["schemaReference"]}).validate(internal["example"])
    assert internal["publicHttpEndpoint"] is False
    checks.append(("Công thức tiền/phân trang của fixtures và ví dụ reservation nội bộ", "PASS"))

    for filename in ["README.md", "stock-reservation-contract.md", "week1-decisions.md"]:
        text = (ROOT / filename).read_text(encoding="utf-8")
        assert text.count("```") % 2 == 0, f"Code fence chưa đóng: {filename}"
        for link in re.findall(r"\]\(([^)]+)\)", text):
            if not link.startswith(("http:", "https:", "#")) and link != "validation-report.md":
                assert (ROOT / link).exists(), f"Link file không tồn tại: {link}"
    checks.append(("Markdown fences và liên kết file nội bộ", "PASS"))

    source_notes = []
    if source is not None:
        source = source.resolve()
        prisma = (source / "backend/prisma/schema.prisma").read_text(encoding="utf-8")
        initial = (source / "backend/prisma/migrations/20261008010100_init/migration.sql").read_text(encoding="utf-8")
        manual = (source / internal["sourceFile"]).read_text(encoding="utf-8")
        for enum in ["OrderStatus", "ReservationStatus", "PaymentStatus", "PaymentMethod"]:
            content = re.search(r"enum\s+" + enum + r"\s*{([^}]+)}", prisma).group(1)
            values = [line.split("//")[0].strip() for line in content.splitlines() if line.split("//")[0].strip()]
            assert values == spec["components"]["schemas"][enum]["enum"], f"Enum lệch: {enum}"
        signature = re.search(r"FUNCTION\s+(fn_reserve_stock\s*\([^)]*\)\s*RETURNS\s+BIGINT)", manual, re.I).group(1)
        normalize = lambda s: re.sub(r"\s+", "", s).lower()
        assert normalize(signature) == normalize(internal["sqlSignature"]), "Chữ ký SQL không khớp"
        assert 'GENERATED ALWAYS AS ("stock" - "reserved_stock") STORED' in initial
        assert 'uq_payments_one_success_per_order' in manual
        assert 'WHERE "status" = \'SUCCESS\'' in manual
        assert 'reserved_stock = reserved_stock + p_quantity' in manual
        assert 'INSERT INTO stock_reservations' in manual
        for field in ["grandTotal", "shippingRecipient", "shippingPhone", "shippingAddress", "reservationExpiresAt", "transactionRef", "callbackCount"]:
            assert re.search(r"\b" + field + r"\b", prisma), field
        model_count = len(re.findall(r"^model\s", prisma, re.M))
        enum_count = len(re.findall(r"^enum\s", prisma, re.M))
        checks.append((f"Đối chiếu source: {model_count} model/{enum_count} enum, 4 enum contract, chữ ký SQL và các field/constraints liên quan", "PASS"))
        for path in ["backend/src/core/filters/http-exception.filter.ts", "backend/src/core/interceptors/logging.interceptor.ts"]:
            if not (source / path).exists(): source_notes.append("Source nền thiếu `" + path + "`.")
        if "passwordChangeRequired" not in prisma:
            source_notes.append("Schema nền chưa có passwordChangeRequired; đây là field auth context đề xuất, cần Auth của Khang cung cấp trạng thái tương đương.")
    else:
        source_notes.append("Chưa chạy đối chiếu source ở lần kiểm tra này (không truyền --source).")

    output = [f"PASS — {name}" for name, _ in checks]
    print("\n".join(output))
    print("Không chạy backend, migration, seed, SQL transaction, concurrency hoặc E2E.")
    if report_path:
        digest = hashlib.sha256((ROOT / "openapi.yaml").read_bytes()).hexdigest()
        content = "# Báo cáo kiểm tra bộ API Contract\n\n"
        content += f"**Phiên bản:** {spec['info']['version']} · **Mốc yêu cầu nhóm:** 09/10/2026.\n\n"
        content += "Báo cáo sinh bởi `validate_contract.py` sau khi toàn bộ kiểm tra tài liệu bên dưới hoàn tất. PASS ở đây chỉ áp dụng cho tài liệu/fixtures và đối chiếu tĩnh đã liệt kê.\n\n"
        content += "| Kiểm tra đã chạy | Kết quả |\n|---|---|\n"
        content += "\n".join(f"| {name} | {status} |" for name, status in checks)
        content += f"\n\n- OpenAPI: {len(spec['paths'])} đường dẫn, {len(operations)} thao tác, {len(spec['components']['schemas'])} schemas.\n"
        content += f"- Fixtures: {len(fixtures)} request/response examples; mẫu từ chối schema: {len(negative)}.\n"
        content += "- Công cụ: openapi-spec-validator 0.7.2, openapi-schema-validator 0.6.3, PyYAML 6.0.3; tính tiền mẫu bằng Decimal.\n"
        content += "- Chữ ký/nội dung SQL được đọc từ file; không thực thi hàm SQL.\n"
        content += "\n## Lưu ý từ source nền\n\n" + "\n".join("- " + n for n in source_notes)
        content += "\n\n## Chưa được kiểm thử hoặc xác nhận\n\n"
        content += "- Không chạy API thật, JWT/Auth guard, PostgreSQL migrations/seed, transaction, race condition, load test hoặc E2E.\n"
        content += "- Không chứng nhận chống oversell/idempotency của backend; các ca triển khai nằm trong stock-reservation-contract.md.\n"
        content += "- Các điều kiện nghiệp vụ như productId trùng, so khớp callback, giới hạn BIGINT thực, trạng thái đổi mật khẩu phải được service/guard thực thi; kiểm tra schema mẫu không chứng minh điều đó.\n"
        content += "- Cập nhật Auth mới được đọc từ ảnh, chưa kiểm chứng trên source Auth mới.\n"
        content += "- Chưa có bằng chứng Khang/Minh/Trọng/Triết đã duyệt các lựa chọn ĐỀ XUẤT.\n"
        content += f"\n## Nhận diện bản YAML được kiểm tra\n\nSHA-256: `{digest}`\n"
        content += "\nChạy lại bằng hướng dẫn trong README.md sau mỗi thay đổi contract.\n"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(content, encoding="utf-8")
        print("Đã ghi", report_path.name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Gốc repository cần đối chiếu tĩnh (không bắt buộc)")
    parser.add_argument("--report", type=Path, help="Ghi báo cáo sau khi tất cả kiểm tra qua")
    args = parser.parse_args()
    try:
        run(args.source, args.report)
    except Exception as error:
        print(f"FAIL — {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
