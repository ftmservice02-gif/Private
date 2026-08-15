require("dotenv").config();
const { Pool, types } = require("pg");

// DATE (OID 1082) is parsed by pg into a JS Date at local midnight, which
// then shifts by a day when serialized with toISOString() in a non-UTC
// timezone. Keep it as the raw "YYYY-MM-DD" string instead.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
