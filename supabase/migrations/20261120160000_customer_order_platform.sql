-- The Customer section: the platform and sub-order type on each order.
--
-- ## Why the orders export needed a second look
--
-- Petpooja's All Orders export is NOT one row per order. It is one row per
-- order ITEM, and an order paid in more than one way — or left partly unpaid
-- — has one row per PAYMENT as well. Measured on the export for 22 Aug –
-- 20 Nov 2026: 9,639 rows holding 9,267 orders.
--
-- The customer, the order type and the date are on the item row. The money
-- is not always there:
--
--   - an order paid in one go has its total in `Grand Total` on the item row;
--   - an order that was split has ZERO there, the total in `Payment
--     Description` ("Total : 850.00"), and one row per payment.
--
-- So the order's platform had to be read from Petpooja's **Sub Order Type**
-- (`Zomato`, `Atelier - Swiggy`, `Ambrosia - Swiggy`, `Dine In`, `Pick Up`,
-- `Delivery`, `IGST Area`) rather than guessed from the length of the
-- platform order id.
--
-- Both columns are read-only additions. The existing rows keep their values
-- and the default is an empty string, so nothing that reads the table today
-- changes behaviour.

ALTER TABLE public.customer_orders
    ADD COLUMN IF NOT EXISTS sub_order_type TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS customer_orders_platform_idx
    ON public.customer_orders (platform);

COMMENT ON COLUMN public.customer_orders.sub_order_type IS
  'Petpooja''s Sub Order Type: Dine In, Pick Up, Delivery, Zomato, Atelier - Swiggy, Ambrosia - Swiggy, IGST Area. This is where the order really came from.';
COMMENT ON COLUMN public.customer_orders.platform IS
  'zomato / swiggy / empty for a counter order. Read from the sub order type, never guessed.';
