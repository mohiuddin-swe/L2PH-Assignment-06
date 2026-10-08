import { env } from "../../config/env";
import { AppError } from "../../errors/AppError";

const baseUrl = () => (env.SSLCOMMERZ_IS_LIVE ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com");

export const isGatewayConfigured = () => Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD);

export interface InitSessionInput {
  tranId: string;
  amount: string; // "5000.00"
  currency: string;
  productName: string;
  customer: { name: string; email: string; phone?: string | null };
}

export interface ValidationResult {
  status?: string;
  tran_id?: string;
  amount?: string;
  currency_amount?: string;
  currency_type?: string;
  bank_tran_id?: string;
  card_type?: string;
  [key: string]: unknown;
}

const fetchJson = async (url: string, init?: RequestInit) => {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    return (await res.json()) as Record<string, unknown>;
  } catch {
    throw new AppError(502, "Could not reach the payment gateway, please try again");
  }
};

// Step 1: ask SSLCommerz for a hosted payment page. The student is sent to GatewayPageURL.
export const createSession = async (input: InitSessionInput) => {
  const callbackBase = `${env.APP_BASE_URL}/api/v1/payments/gateway`;
  const body = new URLSearchParams({
    store_id: env.SSLCOMMERZ_STORE_ID ?? "",
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD ?? "",
    total_amount: input.amount,
    currency: input.currency,
    tran_id: input.tranId,
    success_url: `${callbackBase}/success`,
    fail_url: `${callbackBase}/fail`,
    cancel_url: `${callbackBase}/cancel`,
    ipn_url: `${callbackBase}/ipn`,
    shipping_method: "NO",
    product_name: input.productName,
    product_category: "education",
    product_profile: "general",
    cus_name: input.customer.name,
    cus_email: input.customer.email,
    cus_add1: "Dhaka",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    cus_phone: input.customer.phone || "01700000000",
  });

  const json = await fetchJson(`${baseUrl()}/gwprocess/v4/api.php`, { method: "POST", body });
  if (json.status !== "SUCCESS" || typeof json.GatewayPageURL !== "string" || !json.GatewayPageURL) {
    throw new AppError(502, `Payment gateway rejected the request: ${String(json.failedreason ?? "unknown reason")}`);
  }
  return { gatewayUrl: json.GatewayPageURL, sessionKey: String(json.sessionkey ?? "") };
};

// Step 2: NEVER trust the redirect/IPN body. Ask SSLCommerz directly whether val_id is a real, paid transaction.
export const validatePayment = async (valId: string): Promise<ValidationResult> => {
  const url = new URL(`${baseUrl()}/validator/api/validationserverAPI.php`);
  url.searchParams.set("val_id", valId);
  url.searchParams.set("store_id", env.SSLCOMMERZ_STORE_ID ?? "");
  url.searchParams.set("store_passwd", env.SSLCOMMERZ_STORE_PASSWORD ?? "");
  url.searchParams.set("format", "json");
  return (await fetchJson(url.toString())) as ValidationResult;
};