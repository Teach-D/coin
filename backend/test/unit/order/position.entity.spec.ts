import { Position } from 'src/domain/order/entity/position.entity';
import { OrderDirection } from 'src/domain/order/entity/order.entity';

function makePosition(overrides: Partial<Position> = {}): Position {
  const pos = new Position();
  pos.id = 1;
  pos.userId = 1;
  pos.ticker = 'KRW-BTC';
  pos.direction = OrderDirection.LONG;
  pos.quantity = '0.1000000000';
  pos.averagePrice = 50_000_000;
  pos.leverage = 2;
  pos.margin = 5_000_000;
  Object.assign(pos, overrides);
  return pos;
}

describe('Position entity', () => {
  describe('liquidationPrice', () => {
    it('롱_2x_레버리지_청산가_계산', () => {
      const pos = makePosition({ leverage: 2, averagePrice: 50_000_000, direction: OrderDirection.LONG });
      const liqPrice = pos.liquidationPrice();
      expect(liqPrice).toBe(Math.floor(50_000_000 * (1 - 0.9 / 2)));
    });

    it('롱_10x_레버리지_청산가_계산', () => {
      const pos = makePosition({ leverage: 10, averagePrice: 50_000_000, direction: OrderDirection.LONG });
      const liqPrice = pos.liquidationPrice();
      expect(liqPrice).toBe(Math.floor(50_000_000 * (1 - 0.09)));
    });

    it('숏_2x_레버리지_청산가_계산', () => {
      const pos = makePosition({ leverage: 2, averagePrice: 50_000_000, direction: OrderDirection.SHORT });
      const liqPrice = pos.liquidationPrice();
      expect(liqPrice).toBe(Math.floor(50_000_000 * (1 + 0.9 / 2)));
    });

    it('숏_10x_레버리지_청산가_계산', () => {
      const pos = makePosition({ leverage: 10, averagePrice: 50_000_000, direction: OrderDirection.SHORT });
      const liqPrice = pos.liquidationPrice();
      expect(liqPrice).toBe(Math.floor(50_000_000 * (1 + 0.09)));
    });
  });

  describe('unrealizedPnl', () => {
    it('롱_포지션_수익_계산', () => {
      const pos = makePosition({
        direction: OrderDirection.LONG,
        averagePrice: 50_000,
        quantity: '2.0000000000',
        leverage: 2,
        margin: 50_000,
      });
      const pnl = pos.unrealizedPnl(60_000);
      expect(pnl).toBe(Math.floor((60_000 - 50_000) * 2));
    });

    it('숏_포지션_수익_계산', () => {
      const pos = makePosition({
        direction: OrderDirection.SHORT,
        averagePrice: 50_000,
        quantity: '2.0000000000',
        leverage: 2,
        margin: 50_000,
      });
      const pnl = pos.unrealizedPnl(40_000);
      expect(pnl).toBe(Math.floor((50_000 - 40_000) * 2));
    });

    it('숏_포지션_3x_레버리지_0.49퍼센트_하락_수익_검증', () => {
      const pos = makePosition({
        direction: OrderDirection.SHORT,
        averagePrice: 3_050_000,
        quantity: (50_000 * 3 / 3_050_000).toFixed(10),
        leverage: 3,
        margin: 50_000,
      });
      const pnl = pos.unrealizedPnl(3_035_050);
      expect(pnl).toBe(735);
    });
  });

  describe('evaluatedValue', () => {
    it('평가금액_마진_플러스_미실현손익', () => {
      const pos = makePosition({
        direction: OrderDirection.LONG,
        averagePrice: 50_000,
        quantity: '2.0000000000',
        leverage: 2,
        margin: 50_000,
      });
      const evaluated = pos.evaluatedValue(55_000);
      const expectedPnl = Math.floor((55_000 - 50_000) * 2);
      expect(evaluated).toBe(50_000 + expectedPnl);
    });
  });
});
