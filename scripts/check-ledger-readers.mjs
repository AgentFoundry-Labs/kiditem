#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
]);
const PRISMA_READ_METHOD_NAMES = [
  'aggregate',
  'count',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
];
const PRISMA_READ_METHOD_SET = new Set(PRISMA_READ_METHOD_NAMES);
const PRISMA_MUTATION_METHOD_NAMES = [
  'create',
  'createMany',
  'createManyAndReturn',
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
];
const PRISMA_MUTATION_METHOD_SET = new Set(PRISMA_MUTATION_METHOD_NAMES);
const PRISMA_RELATION_METHOD_SET = new Set([
  ...PRISMA_READ_METHOD_NAMES,
  ...PRISMA_MUTATION_METHOD_NAMES,
]);
const PRISMA_NESTED_MUTATION_METHOD_SET = new Set([
  'connectOrCreate',
  'create',
  'createMany',
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'upsert',
]);
const PRISMA_REVERSE_RELATION_MUTATION_METHOD_SET = new Set([
  ...PRISMA_NESTED_MUTATION_METHOD_SET,
  'connect',
  'disconnect',
  'set',
]);
const PRISMA_DATA_ARGUMENT_NAMES = new Set(['data']);
const PRISMA_UPSERT_DATA_ARGUMENT_NAMES = new Set(['create', 'update']);
const LEDGER_MUTATION_ACCESS_KINDS = new Set([
  'Prisma delegate mutation',
  'Prisma relation mutation',
  'raw SQL mutation',
]);
const RETIRED_LISTING_AD_FIELDS = new Set([
  'adClicks',
  'adConversions',
  'adImpressions',
  'adOrders',
  'adRevenue',
  'adSpend',
]);
const RETIRED_LISTING_AD_WRITERS = new Set([
  'apps/server/src/advertising/adapter/out/repository/channel-listing-daily.repository.adapter.ts',
  'apps/server/src/advertising/adapter/out/repository/ad-traffic-source.repository.ts',
  'apps/server/src/analytics/traffic/traffic-upload.ts',
]);
const RETIRED_LISTING_AD_READER = 'apps/server/src/advertising/read/ad-target-facts.ts';

function slash(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArguments(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let requireNoLegacy = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root requires a path');
      root = path.resolve(value);
      index += 1;
    } else if (argument === '--require-no-legacy') {
      requireNoLegacy = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { root, requireNoLegacy };
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function validateRelativePath(root, value, label) {
  const relativePath = slash(requireString(value, label));
  if (
    path.isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith('../')
  ) {
    throw new Error(
      `${label} must stay inside the repository: ${relativePath}`,
    );
  }
  if (!existsSync(path.join(root, relativePath))) {
    throw new Error(`${label} does not exist: ${relativePath}`);
  }
  return relativePath;
}

function listFilesWithExtension(root, relativeRoots, extension) {
  const files = [];
  const visit = (absoluteDirectory) => {
    for (const entry of readdirSync(absoluteDirectory, {
      withFileTypes: true,
    })) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && path.extname(entry.name) === extension) {
        files.push(absolutePath);
      }
    }
  };
  for (const relativeRoot of relativeRoots) {
    visit(path.join(root, relativeRoot));
  }
  return files.sort();
}

function lowerCamel(value) {
  return value[0].toLowerCase() + value.slice(1);
}

function prismaRelationName(line) {
  return (
    /@relation\(\s*"([^"]+)"/.exec(line)?.[1] ??
    /@relation\([^)]*\bname\s*:\s*"([^"]+)"/.exec(line)?.[1] ??
    null
  );
}

function parsePrismaModels(root, prismaSchemaRoots) {
  const models = new Map();

  for (const schemaFile of listFilesWithExtension(
    root,
    prismaSchemaRoots,
    '.prisma',
  )) {
    let currentModel = null;
    for (const sourceLine of readFileSync(schemaFile, 'utf8').split('\n')) {
      const line = sourceLine.replace(/\/\/.*$/, '');
      const modelStart = /^\s*model\s+([A-Za-z_]\w*)\s*\{/.exec(line);
      if (modelStart) {
        const name = modelStart[1];
        if (models.has(name)) {
          throw new Error(`Prisma schema defines model ${name} more than once`);
        }
        currentModel = { fields: [], name };
        models.set(name, currentModel);
        continue;
      }
      if (currentModel && /^\s*}/.test(line)) {
        currentModel = null;
        continue;
      }
      if (!currentModel) continue;
      const field =
        /^\s*([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(\[\]|\?)?(?:\s|$)/.exec(line);
      if (field) {
        currentModel.fields.push({
          name: field[1],
          ownsForeignKey: /@relation\([^)]*\bfields\s*:/.test(line),
          relationName: prismaRelationName(line),
          type: field[2],
        });
      }
    }
  }

  return models;
}

function derivePrismaRelations(root, prismaSchemaRoots, prismaType) {
  const models = parsePrismaModels(root, prismaSchemaRoots);
  const targetModel = models.get(prismaType);

  if (!targetModel) {
    throw new Error(`Prisma schema does not define model ${prismaType}`);
  }
  const relations = [];
  for (const parentModel of models.values()) {
    if (parentModel === targetModel) continue;
    for (const field of parentModel.fields) {
      if (field.type !== prismaType) continue;
      const inverseRelations = targetModel.fields.filter(
        (candidate) =>
          candidate.type === parentModel.name &&
          candidate.relationName === field.relationName,
      );
      if (inverseRelations.length !== 1) {
        throw new Error(
          `Cannot derive Prisma relation ownership for ${parentModel.name}.${field.name}`,
        );
      }
      relations.push({
        name: field.name,
        parentDelegate: lowerCamel(parentModel.name),
        targetOwnsForeignKey: inverseRelations[0].ownsForeignKey,
      });
    }
  }
  return relations.sort(
    (left, right) =>
      left.parentDelegate.localeCompare(right.parentDelegate) ||
      left.name.localeCompare(right.name),
  );
}

function validateRelationNames({
  root,
  prismaSchemaRoots,
  prismaType,
  relationNames,
  prefix,
}) {
  if (!Array.isArray(relationNames)) {
    throw new Error(`${prefix}.relationNames must be an array`);
  }
  const declared = relationNames.map((name, index) =>
    requireString(name, `${prefix}.relationNames[${index}]`),
  );
  if (new Set(declared).size !== declared.length) {
    throw new Error(`${prefix}.relationNames contains duplicates`);
  }

  const prismaRelations = derivePrismaRelations(
    root,
    prismaSchemaRoots,
    prismaType,
  );
  const schemaNames = [
    ...new Set(prismaRelations.map((relation) => relation.name)),
  ].sort();
  const declaredNames = new Set(declared);
  const schemaNameSet = new Set(schemaNames);
  const missing = schemaNames.filter((name) => !declaredNames.has(name));
  const extra = declared.filter((name) => !schemaNameSet.has(name)).sort();
  if (missing.length > 0 || extra.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(', ')}` : null,
      extra.length > 0 ? `extra: ${extra.join(', ')}` : null,
    ].filter(Boolean);
    throw new Error(
      `${prefix}.relationNames do not match the Prisma schema (${details.join('; ')})`,
    );
  }
  return { relationNames: [...declared].sort(), prismaRelations };
}

function validateManifest(root, input) {
  if (!input || input.version !== 1)
    throw new Error('ledger reader manifest version must be 1');
  if (!Array.isArray(input.scanRoots) || input.scanRoots.length === 0) {
    throw new Error('ledger reader manifest needs at least one scanRoot');
  }
  if (!Array.isArray(input.ledgers) || input.ledgers.length === 0) {
    throw new Error('ledger reader manifest needs at least one ledger');
  }
  if (
    !Array.isArray(input.prismaSchemaRoots) ||
    input.prismaSchemaRoots.length === 0
  ) {
    throw new Error(
      'ledger reader manifest needs at least one prismaSchemaRoot',
    );
  }

  const scanRoots = input.scanRoots.map((entry, index) =>
    validateRelativePath(root, entry, `scanRoots[${index}]`),
  );
  const prismaSchemaRoots = input.prismaSchemaRoots.map((entry, index) =>
    validateRelativePath(root, entry, `prismaSchemaRoots[${index}]`),
  );
  const tables = new Set();
  const prismaModels = new Set();
  const ledgers = input.ledgers.map((entry, ledgerIndex) => {
    const prefix = `ledgers[${ledgerIndex}]`;
    const name = requireString(entry?.name, `${prefix}.name`);
    const table = requireString(entry?.table, `${prefix}.table`);
    const prismaModel = requireString(
      entry?.prismaModel,
      `${prefix}.prismaModel`,
    );
    const prismaType = requireString(entry?.prismaType, `${prefix}.prismaType`);
    const { relationNames, prismaRelations } = validateRelationNames({
      root,
      prismaSchemaRoots,
      prismaType,
      relationNames: entry?.relationNames,
      prefix,
    });
    const reader = validateRelativePath(
      root,
      entry?.reader,
      `${prefix}.reader`,
    );
    if (tables.has(table)) throw new Error(`duplicate ledger table: ${table}`);
    if (prismaModels.has(prismaModel))
      throw new Error(`duplicate Prisma ledger model: ${prismaModel}`);
    tables.add(table);
    prismaModels.add(prismaModel);

    const ownerPublications = (entry.ownerPublications ?? []).map(
      (publication, index) => ({
        path: validateRelativePath(
          root,
          publication?.path,
          `${prefix}.ownerPublications[${index}].path`,
        ),
        reason: requireString(
          publication?.reason,
          `${prefix}.ownerPublications[${index}].reason`,
        ),
      }),
    );
    const legacyReaders = (entry.legacyReaders ?? []).map((legacy, index) => {
      const removeWith = requireString(
        legacy?.removeWith,
        `${prefix}.legacyReaders[${index}].removeWith`,
      );
      if (!/^KID-\d+$/.test(removeWith)) {
        throw new Error(
          `${prefix}.legacyReaders[${index}].removeWith must be a KID issue`,
        );
      }
      return {
        path: validateRelativePath(
          root,
          legacy?.path,
          `${prefix}.legacyReaders[${index}].path`,
        ),
        removeWith,
        reason: requireString(
          legacy?.reason,
          `${prefix}.legacyReaders[${index}].reason`,
        ),
      };
    });

    const allowedPaths = [
      reader,
      ...ownerPublications.map((publication) => publication.path),
      ...legacyReaders.map((legacy) => legacy.path),
    ];
    if (new Set(allowedPaths).size !== allowedPaths.length) {
      throw new Error(
        `${prefix} declares the same allowed path more than once`,
      );
    }
    return {
      name,
      table,
      prismaModel,
      prismaType,
      relationNames,
      prismaRelations,
      reader,
      ownerPublications,
      legacyReaders,
    };
  });

  return { scanRoots, prismaSchemaRoots, ledgers };
}

function listSourceFiles(root, scanRoots) {
  const files = [];
  const visit = (absoluteDirectory) => {
    for (const entry of readdirSync(absoluteDirectory, {
      withFileTypes: true,
    })) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (
        entry.isFile() &&
        SOURCE_EXTENSIONS.has(path.extname(entry.name))
      ) {
        files.push(slash(path.relative(root, absolutePath)));
      }
    }
  };
  for (const scanRoot of scanRoots) visit(path.join(root, scanRoot));
  return files.sort();
}

function isTestOrSeed(relativePath) {
  return (
    /(^|\/)(__tests__|test-helpers)(\/|$)/.test(relativePath) ||
    /\.(spec|test|seed)\.[^.]+$/.test(relativePath)
  );
}

function propertyName(node) {
  if (!node?.name) return null;
  if (
    ts.isIdentifier(node.name) ||
    ts.isStringLiteral(node.name) ||
    ts.isNumericLiteral(node.name)
  ) {
    return node.name.text;
  }
  if (
    ts.isComputedPropertyName(node.name) &&
    ts.isStringLiteral(node.name.expression)
  ) {
    return node.name.expression.text;
  }
  return null;
}

function memberAccessName(node, checker) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression
  ) {
    const argument = unwrapExpression(node.argumentExpression);
    if (
      ts.isStringLiteral(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument)
    ) {
      return argument.text;
    }
    return checker ? resolveImmutableString(argument, checker) : null;
  }
  return null;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function createSourceAnalysis(source) {
  const fileName = 'ledger-reader.tsx';
  const options = {
    jsx: ts.JsxEmit.Preserve,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    options.target,
    true,
    ts.ScriptKind.TSX,
  );
  const host = ts.createCompilerHost(options, true);
  host.fileExists = (candidate) => candidate === fileName;
  host.getSourceFile = (candidate) =>
    candidate === fileName ? sourceFile : undefined;
  host.readFile = (candidate) => (candidate === fileName ? source : undefined);
  const program = ts.createProgram([fileName], options, host);
  return {
    checker: program.getTypeChecker(),
    sourceFile: program.getSourceFile(fileName),
  };
}

function containingConstDeclaration(node) {
  let current = node;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isVariableDeclaration(current)) {
      return ts.isVariableDeclarationList(current.parent) &&
        (current.parent.flags & ts.NodeFlags.Const) !== 0
        ? current
        : null;
    }
    current = current.parent;
  }
  return null;
}

function symbolForIdentifier(identifier, checker) {
  if (ts.isShorthandPropertyAssignment(identifier.parent)) {
    return checker.getShorthandAssignmentValueSymbol(identifier.parent);
  }
  return checker.getSymbolAtLocation(identifier);
}

function resolveConstBinding(identifier, checker) {
  const symbol = symbolForIdentifier(identifier, checker);
  const declaration =
    symbol?.valueDeclaration ??
    symbol?.declarations?.find(
      (candidate) =>
        ts.isVariableDeclaration(candidate) || ts.isBindingElement(candidate),
    );
  if (!declaration || !containingConstDeclaration(declaration)) return null;
  if (ts.isVariableDeclaration(declaration)) {
    return declaration.initializer
      ? { initializer: declaration.initializer }
      : null;
  }
  if (!ts.isBindingElement(declaration)) return null;
  const name = declaration.propertyName ?? declaration.name;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return { propertyName: name.text };
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
    return { propertyName: name.expression.text };
  }
  return null;
}

function resolveImmutableString(node, checker, visited = new Set()) {
  const expression = unwrapExpression(node);
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (!ts.isIdentifier(expression) || visited.has(expression)) return null;
  const binding = resolveConstBinding(expression, checker);
  if (!binding?.initializer) return null;
  return resolveImmutableString(
    binding.initializer,
    checker,
    new Set([...visited, expression]),
  );
}

function resolveDelegateName(node, checker, visited = new Set()) {
  const expression = unwrapExpression(node);
  if (visited.has(expression)) return null;
  visited.add(expression);

  const directName = memberAccessName(expression, checker);
  if (directName) return directName;
  if (!ts.isIdentifier(expression)) return null;
  const binding = resolveConstBinding(expression, checker);
  if (binding?.propertyName) return binding.propertyName;
  return binding?.initializer
    ? resolveDelegateName(binding.initializer, checker, visited)
    : null;
}

function hasReachableRelationProperty(node, relationNames, checker, visited) {
  const expression = unwrapExpression(node);
  if (visited.has(expression)) return false;
  visited.add(expression);

  if (ts.isIdentifier(expression)) {
    const binding = resolveConstBinding(expression, checker);
    return binding?.initializer
      ? hasReachableRelationProperty(
          binding.initializer,
          relationNames,
          checker,
          visited,
        )
      : false;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.some((element) =>
      hasReachableRelationProperty(
        ts.isSpreadElement(element) ? element.expression : element,
        relationNames,
        checker,
        visited,
      ),
    );
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.some((property) => {
      if (
        (ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property)) &&
        relationNames.has(propertyName(property))
      ) {
        return true;
      }
      if (ts.isPropertyAssignment(property)) {
        return hasReachableRelationProperty(
          property.initializer,
          relationNames,
          checker,
          visited,
        );
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return hasReachableRelationProperty(
          property.name,
          relationNames,
          checker,
          visited,
        );
      }
      if (ts.isSpreadAssignment(property)) {
        return hasReachableRelationProperty(
          property.expression,
          relationNames,
          checker,
          visited,
        );
      }
      return false;
    });
  }
  return false;
}

function reachablePropertyValues(
  node,
  propertyNames,
  checker,
  visited = new Set(),
) {
  const expression = unwrapExpression(node);
  if (visited.has(expression)) return [];
  visited.add(expression);

  if (ts.isIdentifier(expression)) {
    const binding = resolveConstBinding(expression, checker);
    return binding?.initializer
      ? reachablePropertyValues(
          binding.initializer,
          propertyNames,
          checker,
          visited,
        )
      : [];
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.flatMap((element) =>
      reachablePropertyValues(
        ts.isSpreadElement(element) ? element.expression : element,
        propertyNames,
        checker,
        visited,
      ),
    );
  }
  if (!ts.isObjectLiteralExpression(expression)) return [];

  return expression.properties.flatMap((property) => {
    if (
      (ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property)) &&
      propertyNames.has(propertyName(property))
    ) {
      return [
        ts.isPropertyAssignment(property)
          ? property.initializer
          : property.name,
      ];
    }
    if (ts.isSpreadAssignment(property)) {
      return reachablePropertyValues(
        property.expression,
        propertyNames,
        checker,
        visited,
      );
    }
    return [];
  });
}

function hasNestedRelationMutation(argument, methodName, relations, checker) {
  const dataArgumentNames =
    methodName === 'upsert'
      ? PRISMA_UPSERT_DATA_ARGUMENT_NAMES
      : PRISMA_DATA_ARGUMENT_NAMES;
  return reachablePropertyValues(argument, dataArgumentNames, checker).some(
    (data) =>
      relations.some((relation) =>
        reachablePropertyValues(data, new Set([relation.name]), checker).some(
          (relationMutation) =>
            reachablePropertyValues(
              relationMutation,
              relation.targetOwnsForeignKey
                ? PRISMA_REVERSE_RELATION_MUTATION_METHOD_SET
                : PRISMA_NESTED_MUTATION_METHOD_SET,
              checker,
            ).length > 0,
        ),
      ),
  );
}

function detectPrismaRelationAccess(source, prismaRelations) {
  const access = { mutation: false, read: false };
  if (prismaRelations.length === 0) return access;
  if (!prismaRelations.some((relation) => source.includes(relation.name))) {
    return access;
  }
  const { checker, sourceFile } = createSourceAnalysis(source);
  const relationsByDelegate = new Map();
  for (const relation of prismaRelations) {
    const delegateRelations = relationsByDelegate.get(relation.parentDelegate);
    if (delegateRelations) delegateRelations.push(relation);
    else relationsByDelegate.set(relation.parentDelegate, [relation]);
  }
  const visit = (node) => {
    if (access.mutation && access.read) return;
    if (ts.isCallExpression(node)) {
      const methodName = memberAccessName(node.expression, checker);
      if (methodName && PRISMA_RELATION_METHOD_SET.has(methodName)) {
        const delegateName = resolveDelegateName(
          node.expression.expression,
          checker,
        );
        const relations = delegateName
          ? relationsByDelegate.get(delegateName)
          : null;
        if (relations) {
          const relationNames = new Set(
            relations.map((relation) => relation.name),
          );
          if (
            node.arguments.some((argument) =>
              hasReachableRelationProperty(
                argument,
                relationNames,
                checker,
                new Set(),
              ),
            )
          ) {
            access.read = true;
          }
          if (
            PRISMA_MUTATION_METHOD_SET.has(methodName) &&
            node.arguments.some((argument) =>
              hasNestedRelationMutation(
                argument,
                methodName,
                relations,
                checker,
              ),
            )
          ) {
            access.mutation = true;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return access;
}

function detectPrismaDelegateAccess(source, prismaModel) {
  const access = { mutation: false, read: false };
  if (!source.includes(prismaModel)) return access;
  const { checker, sourceFile } = createSourceAnalysis(source);
  const visit = (node) => {
    if (access.mutation && access.read) return;
    if (ts.isCallExpression(node)) {
      const methodName = memberAccessName(node.expression, checker);
      if (
        methodName &&
        PRISMA_RELATION_METHOD_SET.has(methodName) &&
        resolveDelegateName(node.expression.expression, checker) === prismaModel
      ) {
        access.read = true;
        if (PRISMA_MUTATION_METHOD_SET.has(methodName)) {
          access.mutation = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return access;
}

function hasRetiredListingPrismaRead(source) {
  if (
    !source.includes('channelListingDailySnapshot') ||
    ![...RETIRED_LISTING_AD_FIELDS].some((field) => source.includes(field))
  ) {
    return false;
  }
  const { checker, sourceFile } = createSourceAnalysis(source);
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const methodName = memberAccessName(node.expression, checker);
      if (
        methodName &&
        PRISMA_READ_METHOD_SET.has(methodName) &&
        resolveDelegateName(node.expression.expression, checker) ===
          'channelListingDailySnapshot' &&
        node.arguments.some((argument) =>
          hasReachableRelationProperty(
            argument,
            RETIRED_LISTING_AD_FIELDS,
            checker,
            new Set(),
          ),
        )
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isPrismaMember(node, memberName, checker) {
  const expression = unwrapExpression(node);
  if (
    !ts.isPropertyAccessExpression(expression) &&
    !ts.isElementAccessExpression(expression)
  ) {
    return false;
  }
  const receiver = unwrapExpression(expression.expression);
  return (
    memberAccessName(expression, checker) === memberName &&
    ts.isIdentifier(receiver) &&
    receiver.text === 'Prisma'
  );
}

function resolvePrismaSql(node, checker, visited = new Set()) {
  const expression = unwrapExpression(node);
  if (visited.has(expression)) return null;
  const nextVisited = new Set([...visited, expression]);

  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isIdentifier(expression)) {
    const binding = resolveConstBinding(expression, checker);
    return binding?.initializer
      ? resolvePrismaSql(binding.initializer, checker, nextVisited)
      : null;
  }
  if (
    ts.isCallExpression(expression) &&
    isPrismaMember(expression.expression, 'raw', checker) &&
    expression.arguments.length === 1
  ) {
    return resolvePrismaSql(expression.arguments[0], checker, nextVisited);
  }
  if (
    ts.isTaggedTemplateExpression(expression) &&
    (isPrismaMember(expression.tag, 'sql', checker) ||
      ['$queryRaw', '$executeRaw'].includes(
        memberAccessName(expression.tag, checker),
      ))
  ) {
    if (ts.isNoSubstitutionTemplateLiteral(expression.template)) {
      return expression.template.text;
    }
    let sql = expression.template.head.text;
    for (const span of expression.template.templateSpans) {
      sql +=
        resolvePrismaSql(span.expression, checker, nextVisited) ?? ' ? ';
      sql += span.literal.text;
    }
    return sql;
  }
  return null;
}

function collectPrismaRawSql(source) {
  if (
    !source.includes('$queryRaw') && !source.includes('$executeRaw')
  ) {
    return [];
  }
  const { checker, sourceFile } = createSourceAnalysis(source);
  const queries = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const methodName = memberAccessName(node.expression, checker);
      if (methodName === '$queryRaw' || methodName === '$executeRaw') {
        for (const argument of node.arguments) {
          const sql = resolvePrismaSql(argument, checker);
          if (sql) queries.push(sql);
        }
      }
    } else if (ts.isTaggedTemplateExpression(node)) {
      const methodName = memberAccessName(node.tag, checker);
      if (methodName === '$queryRaw' || methodName === '$executeRaw') {
        const sql = resolvePrismaSql(node, checker);
        if (sql) queries.push(sql);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return queries;
}

function detectLedgerAccess(source, ledger, file) {
  const reads = [];
  const delegateAccess = detectPrismaDelegateAccess(
    source,
    ledger.prismaModel,
  );
  if (delegateAccess.read) reads.push('Prisma delegate access');
  if (delegateAccess.mutation) {
    reads.push('Prisma delegate mutation');
  }
  const relationAccess = detectPrismaRelationAccess(
    source,
    ledger.prismaRelations,
  );
  if (relationAccess.read) {
    reads.push('Prisma relation read');
  }
  if (relationAccess.mutation) reads.push('Prisma relation mutation');

  const tableTarget = `(?:"?[A-Za-z_][A-Za-z0-9_]*"?\\s*\\.\\s*)?"?${escapeRegExp(ledger.table)}"?`;
  const rawSqlMutationPattern = new RegExp(
    `\\b(?:insert\\s+into|update|delete\\s+from)\\s+${tableTarget}\\b`,
    'im',
  );
  const code = path.extname(file) === '.sql'
    ? source
    : ts.createPrinter({ removeComments: true }).printFile(
      ts.createSourceFile(
        file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
      ),
    );
  const rawSql = [code, ...collectPrismaRawSql(source)];
  const hasRawSqlMutation = rawSql.some((sql) =>
    rawSqlMutationPattern.test(sql),
  );
  if (hasRawSqlMutation) reads.push('raw SQL mutation');
  const rawSqlReadPattern = new RegExp(
    `\\b(?:from|join)\\s+${tableTarget}\\b`,
    'im',
  );
  if (
    !hasRawSqlMutation &&
    rawSql.some((sql) => rawSqlReadPattern.test(sql))
  ) {
    reads.push('raw SQL read');
  }
  return reads;
}

// These negative rules came from check-listing-day-ad-reader.sh. The listing
// table is a dead advertising rollup rather than a ledger, so it does not
// belong in the ledger inventory, but its reads stay forbidden until cutover.
function detectRetiredListingAdReads(source) {
  const reads = [];
  if (/\b(?:adCoverageStatus|trafficCoverageStatus)\b/.test(source)) {
    reads.push('retired coverage-status read');
  }
  if (hasRetiredListingPrismaRead(source)) {
    reads.push('retired Prisma read');
  }
  if (
    /(?:\b(?:from|join)\s+"?channel_listing_daily_snapshots"?\b[^;]*?\bad_(?:spend|revenue|impressions|clicks|conversions|orders)\b|\bad_(?:spend|revenue|impressions|clicks|conversions|orders)\b[^;]*?\b(?:from|join)\s+"?channel_listing_daily_snapshots"?\b)/ims.test(
      source,
    )
  ) {
    reads.push('retired raw SQL read');
  }
  return reads;
}

export function inspectLedgerReaders({
  root,
  manifest,
  requireNoLegacy = false,
}) {
  const violations = [];
  const legacyViolations = [];
  const files = listSourceFiles(root, manifest.scanRoots).filter(
    (file) => !isTestOrSeed(file),
  );

  for (const ledger of manifest.ledgers) {
    const readAllowed = new Set([
      ledger.reader,
      ...ledger.ownerPublications.map((publication) => publication.path),
      ...ledger.legacyReaders.map((legacy) => legacy.path),
    ]);
    const mutationAllowed = new Set(
      ledger.ownerPublications.map((publication) => publication.path),
    );
    for (const file of files) {
      const source = readFileSync(path.join(root, file), 'utf8');
      for (const kind of detectLedgerAccess(source, ledger, file)) {
        const allowed = LEDGER_MUTATION_ACCESS_KINDS.has(kind)
          ? mutationAllowed.has(file)
          : readAllowed.has(file);
        if (allowed) continue;
        violations.push({
          file,
          kind,
          ledger: ledger.name,
          reader: ledger.reader,
        });
      }
    }
    if (requireNoLegacy) {
      for (const legacy of ledger.legacyReaders) {
        legacyViolations.push({ ...legacy, ledger: ledger.name });
      }
    }
  }

  for (const file of files) {
    if (RETIRED_LISTING_AD_WRITERS.has(file)) continue;
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const kind of detectRetiredListingAdReads(source)) {
      violations.push({
        file,
        kind,
        ledger: 'retired listing-day advertising fields',
        reader: RETIRED_LISTING_AD_READER,
      });
    }
  }

  return { violations, legacyViolations };
}

export function loadManifest(root) {
  const manifestPath = path.join(root, 'scripts/ledger-readers.json');
  const input = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return validateManifest(root, input);
}

function main() {
  let options;
  let manifest;
  try {
    options = parseArguments(process.argv.slice(2));
    manifest = loadManifest(options.root);
  } catch (error) {
    console.error(`check:ledger-readers FAIL: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = inspectLedgerReaders({ ...options, manifest });
  if (result.violations.length > 0 || result.legacyViolations.length > 0) {
    console.error('check:ledger-readers FAIL');
    for (const violation of result.violations) {
      console.error(
        `${violation.file}: ${violation.kind} of ${violation.ledger}; use ${violation.reader}`,
      );
    }
    for (const legacy of result.legacyViolations) {
      console.error(
        `${legacy.path}: legacy reader of ${legacy.ledger}; remove with ${legacy.removeWith} (${legacy.reason})`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const ledgerCount = manifest.ledgers.length;
  const legacyCount = manifest.ledgers.reduce(
    (count, ledger) => count + ledger.legacyReaders.length,
    0,
  );
  console.log(
    `check:ledger-readers PASS (${ledgerCount} ledger${ledgerCount === 1 ? '' : 's'}, ${legacyCount} legacy reader${legacyCount === 1 ? '' : 's'})`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
