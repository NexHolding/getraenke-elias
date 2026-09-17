-- Longneck soft drinks use an 8-cent bottle; not every soft drink uses 15 cents.
update products set deposit_profile='beer',deposit_cents=342,data_note='24 × 0,33 l Mehrweg-Longneck: 24 × 0,08 € + 1,50 € Kasten. Gebinde beim Wareneingang abgleichen.' where id in ('elias-049','elias-050');
