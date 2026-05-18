import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';
import { OrderService } from 'src/domain/order/service/order.service';
import { OrderRepository } from 'src/domain/order/repository/order.repository';
import { PositionRepository } from 'src/domain/order/repository/position.repository';
import { UserRepository } from 'src/domain/user/repository/user.repository';
import { TickerRedisRepository } from 'src/domain/market/repository/ticker-redis.repository';
import { RedisService } from 'src/common/config/redis.config';
import { User, AuthProvider, UserRole } from 'src/domain/user/entity/user.entity';
import { Order } from 'src/domain/order/entity/order.entity';
import { Position } from 'src/domain/order/entity/position.entity';
import { OrderType, OrderDirection } from 'src/domain/order/entity/order.entity';
import { ConfigModule } from '@nestjs/config';

describe('OrderService Integration', () => {
  let module: TestingModule;
  let orderService: OrderService;
  let userRepository: UserRepository;
  let dataSource: DataSource;
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer().start();
    redisContainer = await new RedisContainer().start();

    process.env.DB_HOST = pgContainer.getHost();
    process.env.DB_PORT = pgContainer.getPort().toString();
    process.env.DB_USERNAME = pgContainer.getUsername();
    process.env.DB_PASSWORD = pgContainer.getPassword();
    process.env.DB_NAME = pgContainer.getDatabase();
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = redisContainer.getPort().toString();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: pgContainer.getHost(),
          port: pgContainer.getPort(),
          username: pgContainer.getUsername(),
          password: pgContainer.getPassword(),
          database: pgContainer.getDatabase(),
          entities: [User, Order, Position],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User, Order, Position]),
        EventEmitterModule.forRoot(),
      ],
      providers: [
        OrderRepository,
        PositionRepository,
        UserRepository,
        {
          provide: TickerRedisRepository,
          useValue: {
            findByMarket: jest.fn().mockResolvedValue({ tradePrice: 50_000 }),
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: RedisService,
          useValue: {
            client: {
              get: jest.fn().mockResolvedValue(null),
              set: jest.fn().mockResolvedValue('OK'),
            },
          },
        },
        OrderService,
      ],
    }).compile();

    orderService = module.get(OrderService);
    userRepository = module.get(UserRepository);
    dataSource = module.get(DataSource);
  }, 120_000);

  afterAll(async () => {
    await module.close();
    await pgContainer.stop();
    await redisContainer.stop();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE orders, positions, users RESTART IDENTITY CASCADE');
  });

  it('매수_주문_정상_처리', async () => {
    const user = new User();
    user.email = 'test@example.com';
    user.nickname = 'testuser';
    user.provider = AuthProvider.GOOGLE;
    user.providerId = 'google-123';
    user.role = UserRole.ROLE_USER;
    user.balance = 5_000_000;
    const savedUser = await userRepository.save(user);

    const request = {
      idempotencyKey: 'buy-integration-1',
      ticker: 'KRW-BTC',
      orderType: OrderType.MARKET,
      direction: OrderDirection.LONG,
      amount: 500_000,
      leverage: 2,
    };

    const result = await orderService.buy(savedUser.id, request);
    expect(result.orderId).toBeDefined();
    expect(result.ticker).toBe('KRW-BTC');
    expect(result.executedAmount).toBe(500_000);
  });
});
