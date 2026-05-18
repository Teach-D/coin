export class OrderFilledEvent {
  constructor(
    public readonly orderId: number,
    public readonly userId: number,
    public readonly ticker: string,
    public readonly evaluatedValue: number,
  ) {}
}
