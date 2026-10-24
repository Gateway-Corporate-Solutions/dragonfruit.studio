CREATE TABLE billing_accounts (
 owner_id uuid PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
 state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(state)='object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_customer_unique ON billing_accounts ((state->>'customerId')) WHERE state->>'customerId' IS NOT NULL;
-- Project creation and billing updates lock this same owner row. Existing projects remain accessible.
