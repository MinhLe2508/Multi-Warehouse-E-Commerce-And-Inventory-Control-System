import { Injectable } from '@nestjs/common';

@Injectable()
export class MockPaymentGatewayService {
  // Sandbox only: do not accept success from a public payment provider callback.
  charge(approved: boolean) {
    return { approved, provider: 'MOCK', code: approved ? 'MOCK_APPROVED' : 'MOCK_DECLINED' };
  }
}
