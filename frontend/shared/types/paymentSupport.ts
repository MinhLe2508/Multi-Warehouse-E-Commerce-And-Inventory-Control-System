export type PaymentSupportRequest = {
  status: 'OPEN' | 'CONFIRMED' | 'CLOSED';
  bankReference: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export type AdminPaymentSupport = PaymentSupportRequest & {
  paymentId: string;
  amount: string;
  transactionRef: string;
  accountNumber: string | null;
  canConfirm: boolean;
};
