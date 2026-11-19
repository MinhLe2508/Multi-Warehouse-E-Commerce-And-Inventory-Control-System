import type { PaymentMethod, ShippingInfo } from "@/shared/types/order";

export const PAYMENT_METHODS: PaymentMethod[] = ["MOCK_CARD", "MOCK_EWALLET", "COD"];
export type FieldError = "required" | "phone" | "email";
export type ShippingErrors = Partial<Record<keyof ShippingInfo, FieldError>>;

export function validateShipping(values: ShippingInfo): ShippingErrors {
  const errors: ShippingErrors = {};
  const required: (keyof ShippingInfo)[] = ["fullName", "phone", "email", "address", "city"];
  for (const key of required) {
    if (!values[key].trim()) errors[key] = "required";
  }
  const phone = values.phone.replace(/[\s.-]/g, "");
  if (!errors.phone && !/^(0|\+84)\d{9,10}$/.test(phone)) errors.phone = "phone";
  if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "email";
  return errors;
}

export function trimShipping(values: ShippingInfo): ShippingInfo {
  return {
    fullName: values.fullName.trim(), phone: values.phone.trim(),
    email: values.email.trim(), address: values.address.trim(),
    city: values.city.trim(), note: values.note.trim(),
  };
}

export const PAYMENT_LABEL_KEYS = { MOCK_CARD: "card", MOCK_EWALLET: "wallet", COD: "cod" } as const;
