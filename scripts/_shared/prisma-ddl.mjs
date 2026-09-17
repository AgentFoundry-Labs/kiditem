/**
 * Reads the PostgreSQL script `prisma migrate diff --script` prints.
 *
 * Every reader of that script decides what it would do to rows that already
 * exist, so they all split it here. A comma or semicolon separates clauses or
 * statements only outside parentheses, brackets, quoted identifiers, string
 * literals, and comments: Prisma writes `"score" DECIMAL(12,6) NOT NULL` as
 * one clause, and a reader that splits it at the comma sees a nullable column.
 */

const IDENTIFIER = String.raw`"(?:[^"]|"")+"`;
/** A table name, optionally schema-qualified. The capture is the table itself. */
const TABLE = String.raw`(?:${IDENTIFIER}\s*\.\s*)?(${IDENTIFIER})`;

const UNIQUE_INDEX = new RegExp(
  String.raw`^CREATE\s+UNIQUE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${IDENTIFIER})\s+ON\s+(?:ONLY\s+)?${TABLE}\s*(?:USING\s+\w+\s*)?(?=\()`,
  'i',
);
const ALTER_TABLE = new RegExp(
  String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${TABLE}\s+`,
  'i',
);
const ADD_COLUMN = new RegExp(
  String.raw`^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENTIFIER})\s*([\s\S]*)$`,
  'i',
);
const DROP_COLUMN = new RegExp(String.raw`^DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(${IDENTIFIER})`, 'i');
const ALTER_COLUMN = new RegExp(String.raw`^ALTER\s+(?:COLUMN\s+)?(${IDENTIFIER})\s+([\s\S]*)$`, 'i');
const ADD_CONSTRAINT = /^ADD\s+(?=CONSTRAINT\b|PRIMARY\s+KEY\b|FOREIGN\s+KEY\b|UNIQUE\b|CHECK\b|EXCLUDE\b)/i;
const DROP_CONSTRAINT = new RegExp(String.raw`^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(${IDENTIFIER})`, 'i');
const CONSTRAINT_HEAD = new RegExp(
  String.raw`^(?:CONSTRAINT\s+(${IDENTIFIER})\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b\s*`,
  'i',
);
const REFERENCES = new RegExp(String.raw`^\s*REFERENCES\s+${TABLE}\s*`, 'i');
const CREATE_TABLE = new RegExp(
  String.raw`^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${TABLE}\s*(?=\()`,
  'i',
);
const COLUMN_ELEMENT = new RegExp(String.raw`^(${IDENTIFIER})\s+([\s\S]*)$`);
const COLUMN_LIST_ENTRY = new RegExp(
  String.raw`^(${IDENTIFIER})(?:\s+(?:[A-Za-z_]\w*|${IDENTIFIER}))*$`,
);

function unquote(identifier) {
  return identifier.slice(1, -1).replaceAll('""', '"');
}

/** The index just past the block comment that opens at `start`. PostgreSQL nests them. */
function blockCommentEnd(text, start) {
  let nesting = 0;
  let index = start;
  while (index < text.length) {
    if (text.startsWith('/*', index)) {
      nesting += 1;
      index += 2;
    } else if (text.startsWith('*/', index)) {
      nesting -= 1;
      index += 2;
      if (nesting === 0) return index;
    } else {
      index += 1;
    }
  }
  return text.length;
}

/**
 * Walks `text`, reporting each character outside string literals and quoted
 * identifiers with the parenthesis/bracket depth it sits at (a bracket itself
 * counts as outside), and each character inside quotes, quote marks included.
 * Comments are skipped: `--` up to the line end, and block comments whole.
 */
function scan(text, { onCode, onQuoted = () => {} }) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      onQuoted(index, char);
      if (char !== quote) continue;
      if (text[index + 1] === quote) {
        index += 1;
        onQuoted(index, char);
      } else {
        quote = null;
      }
      continue;
    }
    if (char === '-' && text[index + 1] === '-') {
      const lineEnd = text.indexOf('\n', index);
      index = (lineEnd === -1 ? text.length : lineEnd) - 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      index = blockCommentEnd(text, index) - 1;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      onQuoted(index, char);
      continue;
    }
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    onCode(index, char, depth);
    if (char === '(' || char === '[') depth += 1;
  }
}

/**
 * Splits `text` at each `separator` outside parentheses, brackets, quotes,
 * and comments. Parts are trimmed, comments dropped, and empty parts skipped.
 */
export function splitTopLevel(text, separator) {
  const parts = [];
  let part = '';
  scan(text, {
    onCode(index, char, depth) {
      if (char === separator && depth === 0) {
        parts.push(part);
        part = '';
      } else {
        part += char;
      }
    },
    onQuoted(index, char) {
      part += char;
    },
  });
  parts.push(part);
  return parts.map((value) => value.trim()).filter((value) => value !== '');
}

/** The script's statements, in order, without comments or closing semicolons. */
export function sqlStatements(sql) {
  return splitTopLevel(sql, ';');
}

/**
 * `text` with every character inside quotes, parentheses, or brackets
 * replaced by a space, so a keyword search sees only the top level. Character
 * positions are kept.
 */
function topLevelOnly(text) {
  const characters = Array.from({ length: text.length }, () => ' ');
  scan(text, {
    onCode(index, char, depth) {
      if (depth === 0) characters[index] = char;
    },
  });
  return characters.join('');
}

/**
 * The group that opens with the parenthesis at `text[open]`: its contents and
 * the text after its closing parenthesis. Null when `text[open]` is not `(` or
 * the group never closes.
 */
function parenthesized(text, open) {
  if (text[open] !== '(') return null;
  let result = null;
  let done = false;
  scan(text.slice(open), {
    onCode(index, char, depth) {
      if (done || char !== ')' || depth !== 0) return;
      done = true;
      result = { inner: text.slice(open + 1, open + index), rest: text.slice(open + index + 1) };
    },
  });
  return result;
}

/**
 * The names in a column list. An entry that is not a plain column, such as an
 * expression, keeps its text, so a reader comparing names never mistakes it
 * for a known column.
 */
function columnList(inner) {
  return splitTopLevel(inner, ',').map((entry) => {
    const match = entry.match(COLUMN_LIST_ENTRY);
    return match ? unquote(match[1]) : entry;
  });
}

/**
 * `CREATE UNIQUE INDEX "name" ON "table"("a", "b") WHERE ...`. `where` keeps
 * the text after the column list, which a partial index uses for its
 * predicate, or is null.
 */
export function uniqueIndexes(sql) {
  const found = [];
  for (const statement of sqlStatements(sql)) {
    const head = statement.match(UNIQUE_INDEX);
    if (!head) continue;
    const group = parenthesized(statement, head[0].length);
    if (!group) continue;
    const columns = columnList(group.inner);
    if (!columns.length) continue;
    found.push({
      name: unquote(head[1]),
      table: unquote(head[2]),
      columns,
      where: group.rest.trim() || null,
    });
  }
  return found;
}

/**
 * A table constraint, alone or after `ADD`: its name (null when unnamed), its
 * type, its columns (empty for CHECK and EXCLUDE), and for a foreign key the
 * table and columns it references. `definition` keeps the text after the
 * column list, where options such as `MATCH FULL` and `ON DELETE` sit. A
 * `UNIQUE NULLS NOT DISTINCT` constraint carries `nullsNotDistinct: true`.
 */
export function tableConstraint(text) {
  const head = text.match(CONSTRAINT_HEAD);
  if (!head) return null;
  const type = head[2].toUpperCase().replace(/\s+/, ' ');
  const constraint = {
    name: head[1] ? unquote(head[1]) : null,
    type: {
      'PRIMARY KEY': 'primary-key',
      'FOREIGN KEY': 'foreign-key',
      UNIQUE: 'unique',
      CHECK: 'check',
      EXCLUDE: 'exclude',
    }[type],
    columns: [],
    definition: text.slice(head[0].length).trim(),
  };
  if (constraint.type === 'check' || constraint.type === 'exclude') return constraint;
  let open = head[0].length;
  if (constraint.type === 'unique') {
    // `UNIQUE NULLS NOT DISTINCT (...)` compares NULLs as equal.
    const nulls = text.slice(open).match(/^NULLS\s+(NOT\s+)?DISTINCT\s*/i);
    if (nulls) {
      open += nulls[0].length;
      if (nulls[1]) constraint.nullsNotDistinct = true;
    }
  }
  const group = parenthesized(text, open);
  if (!group) return constraint;
  constraint.columns = columnList(group.inner);
  constraint.definition = group.rest.trim();
  if (constraint.type !== 'foreign-key') return constraint;
  const references = group.rest.match(REFERENCES);
  if (!references) return constraint;
  const target = parenthesized(group.rest, references[0].length);
  constraint.references = {
    table: unquote(references[1]),
    columns: target ? columnList(target.inner) : [],
  };
  constraint.definition = (target ? target.rest : group.rest.slice(references[0].length)).trim();
  return constraint;
}

/**
 * What a new column gives the rows that already exist.
 *
 * - `defaultSql`: its database default, or null. `DEFAULT NULL` is no default.
 * - `filledByDatabase`: a serial or identity column, which PostgreSQL numbers
 *   row by row.
 * - `initialSql`: the value every existing row gets (`'NULL'` for a nullable
 *   column without a default), or null when there is no single value: a
 *   required column without a default, or a serial or identity column.
 * - `requiredWithoutDefault`: PostgreSQL refuses to add the column to a table
 *   that has rows. Prisma's `@default(uuid())` is generated by the client, so
 *   it leaves no database default behind.
 */
function columnDefinition(text) {
  const definition = text.trim();
  const words = topLevelOnly(definition);
  const notNull = /\bNOT\s+NULL\b/i.test(words);
  const filledByDatabase = /^\s*(?:SMALL|BIG)?SERIAL[248]?\b/i.test(words)
    || /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(words);
  // `GENERATED BY DEFAULT AS IDENTITY` names no default expression.
  const defaultAt = words.search(/(?<!\bBY\s+)\bDEFAULT\b/i);
  let defaultSql = defaultAt === -1
    ? null
    : definition
      .slice(defaultAt)
      .replace(/^DEFAULT\s+/i, '')
      .replace(/\s+(?:NOT\s+)?NULL\s*$/i, '')
      .trim();
  if (defaultSql !== null && /^NULL$/i.test(defaultSql)) defaultSql = null;
  return {
    definition,
    notNull,
    defaultSql,
    filledByDatabase,
    initialSql: defaultSql ?? (notNull || filledByDatabase ? null : 'NULL'),
    requiredWithoutDefault: notNull && defaultSql === null && !filledByDatabase,
  };
}

function columnChange(text) {
  const words = topLevelOnly(text);
  if (/^\s*SET\s+NOT\s+NULL\b/i.test(words)) return { change: 'set-not-null' };
  if (/^\s*DROP\s+NOT\s+NULL\b/i.test(words)) return { change: 'drop-not-null' };
  if (/^\s*DROP\s+DEFAULT\b/i.test(words)) return { change: 'drop-default' };
  const setDefault = text.match(/^\s*SET\s+DEFAULT\s+([\s\S]+)$/i);
  if (setDefault) return { change: 'set-default', value: setDefault[1].trim() };
  const setType = text.match(/^\s*(?:SET\s+DATA\s+)?TYPE\s+([\s\S]+)$/i);
  if (setType) return { change: 'set-data-type', value: setType[1].trim() };
  return { change: 'other', value: text.trim() };
}

function alterTableClause(text) {
  let match = text.match(ADD_COLUMN);
  if (match) return { action: 'add-column', column: unquote(match[1]), ...columnDefinition(match[2]) };
  match = text.match(DROP_COLUMN);
  if (match) return { action: 'drop-column', column: unquote(match[1]) };
  match = text.match(ADD_CONSTRAINT);
  if (match) {
    const constraint = tableConstraint(text.slice(match[0].length));
    if (constraint) return { action: 'add-constraint', ...constraint };
  }
  match = text.match(DROP_CONSTRAINT);
  if (match) return { action: 'drop-constraint', name: unquote(match[1]) };
  match = text.match(ALTER_COLUMN);
  if (match) return { action: 'alter-column', column: unquote(match[1]), ...columnChange(match[2]) };
  return { action: 'other', text };
}

/**
 * Every `ALTER TABLE` statement: the table, and each comma-separated clause
 * as an action (`add-column`, `drop-column`, `alter-column`,
 * `add-constraint`, `drop-constraint`, or `other`).
 */
export function alterTableStatements(sql) {
  const found = [];
  for (const statement of sqlStatements(sql)) {
    const head = statement.match(ALTER_TABLE);
    if (!head) continue;
    found.push({
      table: unquote(head[1]),
      clauses: splitTopLevel(statement.slice(head[0].length), ',').map(alterTableClause),
    });
  }
  return found;
}

/**
 * Every `CREATE TABLE` statement: the table, its column names, and its table
 * constraints (a column's inline `PRIMARY KEY` or `UNIQUE` included), as
 * `tableConstraint` reads them.
 */
export function createdTables(sql) {
  const found = [];
  for (const statement of sqlStatements(sql)) {
    const head = statement.match(CREATE_TABLE);
    if (!head) continue;
    const group = parenthesized(statement, head[0].length);
    if (!group) continue;
    const columns = [];
    const constraints = [];
    for (const element of splitTopLevel(group.inner, ',')) {
      const constraint = tableConstraint(element);
      if (constraint) {
        constraints.push(constraint);
        continue;
      }
      const column = element.match(COLUMN_ELEMENT);
      if (!column) continue;
      const name = unquote(column[1]);
      columns.push(name);
      const words = topLevelOnly(column[2]);
      if (/\bPRIMARY\s+KEY\b/i.test(words)) {
        constraints.push({ name: null, type: 'primary-key', columns: [name], definition: '' });
      } else if (/\bUNIQUE\b/i.test(words)) {
        constraints.push({ name: null, type: 'unique', columns: [name], definition: '' });
      }
    }
    found.push({ table: unquote(head[1]), columns, constraints });
  }
  return found;
}

/** Every `ADD COLUMN` clause with its table, as `columnDefinition` reads it. */
export function addedColumns(sql) {
  return alterTableStatements(sql).flatMap(({ table, clauses }) =>
    clauses
      .filter((clause) => clause.action === 'add-column')
      .map(({ action, ...column }) => ({ table, ...column })));
}
