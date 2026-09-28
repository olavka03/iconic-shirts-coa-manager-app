export function assertTestDatabaseName(name: string): string {
  if (!/^coa_manager_test(?:_[a-z0-9]+)*$/.test(name)) {
    throw new Error(
      `Refusing to use "${name}" as a test database. Use coa_manager_test or coa_manager_test_<suffix>, with a suffix of lowercase letters, digits and single underscores (coa_manager_test_review_t0).`,
    );
  }

  return name;
}

const databaseName = assertTestDatabaseName(
  process.env.COA_TEST_DB ?? "coa_manager_test",
);

export const TEST_DATABASE_URL = `postgresql://macbook@localhost:5432/${databaseName}?schema=public`;
export const SERVER_TEST_ENV: Record<string, string> = {
  SHOPIFY_API_KEY: "test-key",
  SHOPIFY_API_SECRET: "test-secret",
  SHOPIFY_APP_URL: "https://app.test",
  SCOPES:
    "read_orders,read_products,write_app_proxy,write_files,write_metaobject_definitions,write_metaobjects",
  LOG_LEVEL: "silent",
};
