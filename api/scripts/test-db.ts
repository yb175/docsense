export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (process.env.NODE_ENV !== 'test' || !/(?:[_-]test|test[_-])/iu.test(url)) {
    throw new Error('Refusing to modify the database: set NODE_ENV=test and use a dedicated test DATABASE_URL');
  }
}
