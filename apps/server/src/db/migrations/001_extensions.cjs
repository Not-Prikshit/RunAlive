/* eslint-disable */
// Migration: 001_extensions
// Enable PostGIS, pgcrypto, citext

exports.up = async (pgm) => {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS postgis`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS citext`);
};

exports.down = async (pgm) => {
  // Extensions are shared — only drop if safe
  pgm.sql(`DROP EXTENSION IF EXISTS citext`);
};
