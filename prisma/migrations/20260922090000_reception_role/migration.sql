-- Роль ресепшена. Отдельной миграцией: PostgreSQL не разрешает использовать
-- только что добавленное значение enum в той же транзакции, где оно создано.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'reception';
