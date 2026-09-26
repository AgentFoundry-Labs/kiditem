"use strict";
var KidItemRuntime = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // extensions/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    OPERATION_STATUSES: () => OPERATION_STATUSES,
    runtime: () => runtime,
    version: () => version
  });

  // extensions/src/collectors/index.ts
  var collectors = /* @__PURE__ */ new Map();
  function registerCollector(collector) {
    if (collectors.has(collector.kind)) throw new Error(`duplicate collector: ${collector.kind}`);
    collectors.set(collector.kind, collector);
  }
  function collectorFor(kind) {
    return collectors.get(kind) ?? null;
  }
  function registeredKinds() {
    return [...collectors.keys()].sort();
  }

  // node_modules/zod/v3/external.js
  var external_exports = {};
  __export(external_exports, {
    BRAND: () => BRAND,
    DIRTY: () => DIRTY,
    EMPTY_PATH: () => EMPTY_PATH,
    INVALID: () => INVALID,
    NEVER: () => NEVER,
    OK: () => OK,
    ParseStatus: () => ParseStatus,
    Schema: () => ZodType,
    ZodAny: () => ZodAny,
    ZodArray: () => ZodArray,
    ZodBigInt: () => ZodBigInt,
    ZodBoolean: () => ZodBoolean,
    ZodBranded: () => ZodBranded,
    ZodCatch: () => ZodCatch,
    ZodDate: () => ZodDate,
    ZodDefault: () => ZodDefault,
    ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
    ZodEffects: () => ZodEffects,
    ZodEnum: () => ZodEnum,
    ZodError: () => ZodError,
    ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
    ZodFunction: () => ZodFunction,
    ZodIntersection: () => ZodIntersection,
    ZodIssueCode: () => ZodIssueCode,
    ZodLazy: () => ZodLazy,
    ZodLiteral: () => ZodLiteral,
    ZodMap: () => ZodMap,
    ZodNaN: () => ZodNaN,
    ZodNativeEnum: () => ZodNativeEnum,
    ZodNever: () => ZodNever,
    ZodNull: () => ZodNull,
    ZodNullable: () => ZodNullable,
    ZodNumber: () => ZodNumber,
    ZodObject: () => ZodObject,
    ZodOptional: () => ZodOptional,
    ZodParsedType: () => ZodParsedType,
    ZodPipeline: () => ZodPipeline,
    ZodPromise: () => ZodPromise,
    ZodReadonly: () => ZodReadonly,
    ZodRecord: () => ZodRecord,
    ZodSchema: () => ZodType,
    ZodSet: () => ZodSet,
    ZodString: () => ZodString,
    ZodSymbol: () => ZodSymbol,
    ZodTransformer: () => ZodEffects,
    ZodTuple: () => ZodTuple,
    ZodType: () => ZodType,
    ZodUndefined: () => ZodUndefined,
    ZodUnion: () => ZodUnion,
    ZodUnknown: () => ZodUnknown,
    ZodVoid: () => ZodVoid,
    addIssueToContext: () => addIssueToContext,
    any: () => anyType,
    array: () => arrayType,
    bigint: () => bigIntType,
    boolean: () => booleanType,
    coerce: () => coerce,
    custom: () => custom,
    date: () => dateType,
    datetimeRegex: () => datetimeRegex,
    defaultErrorMap: () => en_default,
    discriminatedUnion: () => discriminatedUnionType,
    effect: () => effectsType,
    enum: () => enumType,
    function: () => functionType,
    getErrorMap: () => getErrorMap,
    getParsedType: () => getParsedType,
    instanceof: () => instanceOfType,
    intersection: () => intersectionType,
    isAborted: () => isAborted,
    isAsync: () => isAsync,
    isDirty: () => isDirty,
    isValid: () => isValid,
    late: () => late,
    lazy: () => lazyType,
    literal: () => literalType,
    makeIssue: () => makeIssue,
    map: () => mapType,
    nan: () => nanType,
    nativeEnum: () => nativeEnumType,
    never: () => neverType,
    null: () => nullType,
    nullable: () => nullableType,
    number: () => numberType,
    object: () => objectType,
    objectUtil: () => objectUtil,
    oboolean: () => oboolean,
    onumber: () => onumber,
    optional: () => optionalType,
    ostring: () => ostring,
    pipeline: () => pipelineType,
    preprocess: () => preprocessType,
    promise: () => promiseType,
    quotelessJson: () => quotelessJson,
    record: () => recordType,
    set: () => setType,
    setErrorMap: () => setErrorMap,
    strictObject: () => strictObjectType,
    string: () => stringType,
    symbol: () => symbolType,
    transformer: () => effectsType,
    tuple: () => tupleType,
    undefined: () => undefinedType,
    union: () => unionType,
    unknown: () => unknownType,
    util: () => util,
    void: () => voidType
  });

  // node_modules/zod/v3/helpers/util.js
  var util;
  (function(util2) {
    util2.assertEqual = (_) => {
    };
    function assertIs(_arg) {
    }
    util2.assertIs = assertIs;
    function assertNever(_x) {
      throw new Error();
    }
    util2.assertNever = assertNever;
    util2.arrayToEnum = (items) => {
      const obj = {};
      for (const item of items) {
        obj[item] = item;
      }
      return obj;
    };
    util2.getValidEnumValues = (obj) => {
      const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
      const filtered = {};
      for (const k of validKeys) {
        filtered[k] = obj[k];
      }
      return util2.objectValues(filtered);
    };
    util2.objectValues = (obj) => {
      return util2.objectKeys(obj).map(function(e) {
        return obj[e];
      });
    };
    util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
      const keys = [];
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          keys.push(key);
        }
      }
      return keys;
    };
    util2.find = (arr, checker) => {
      for (const item of arr) {
        if (checker(item))
          return item;
      }
      return void 0;
    };
    util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
    function joinValues(array, separator = " | ") {
      return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
    }
    util2.joinValues = joinValues;
    util2.jsonStringifyReplacer = (_, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    };
  })(util || (util = {}));
  var objectUtil;
  (function(objectUtil2) {
    objectUtil2.mergeShapes = (first, second) => {
      return {
        ...first,
        ...second
        // second overwrites first
      };
    };
  })(objectUtil || (objectUtil = {}));
  var ZodParsedType = util.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set"
  ]);
  var getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "undefined":
        return ZodParsedType.undefined;
      case "string":
        return ZodParsedType.string;
      case "number":
        return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
      case "boolean":
        return ZodParsedType.boolean;
      case "function":
        return ZodParsedType.function;
      case "bigint":
        return ZodParsedType.bigint;
      case "symbol":
        return ZodParsedType.symbol;
      case "object":
        if (Array.isArray(data)) {
          return ZodParsedType.array;
        }
        if (data === null) {
          return ZodParsedType.null;
        }
        if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
          return ZodParsedType.promise;
        }
        if (typeof Map !== "undefined" && data instanceof Map) {
          return ZodParsedType.map;
        }
        if (typeof Set !== "undefined" && data instanceof Set) {
          return ZodParsedType.set;
        }
        if (typeof Date !== "undefined" && data instanceof Date) {
          return ZodParsedType.date;
        }
        return ZodParsedType.object;
      default:
        return ZodParsedType.unknown;
    }
  };

  // node_modules/zod/v3/ZodError.js
  var ZodIssueCode = util.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite"
  ]);
  var quotelessJson = (obj) => {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/"([^"]+)":/g, "$1:");
  };
  var ZodError = class _ZodError extends Error {
    get errors() {
      return this.issues;
    }
    constructor(issues) {
      super();
      this.issues = [];
      this.addIssue = (sub) => {
        this.issues = [...this.issues, sub];
      };
      this.addIssues = (subs = []) => {
        this.issues = [...this.issues, ...subs];
      };
      const actualProto = new.target.prototype;
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(this, actualProto);
      } else {
        this.__proto__ = actualProto;
      }
      this.name = "ZodError";
      this.issues = issues;
    }
    format(_mapper) {
      const mapper = _mapper || function(issue) {
        return issue.message;
      };
      const fieldErrors = { _errors: [] };
      const processError = (error) => {
        for (const issue of error.issues) {
          if (issue.code === "invalid_union") {
            issue.unionErrors.map(processError);
          } else if (issue.code === "invalid_return_type") {
            processError(issue.returnTypeError);
          } else if (issue.code === "invalid_arguments") {
            processError(issue.argumentsError);
          } else if (issue.path.length === 0) {
            fieldErrors._errors.push(mapper(issue));
          } else {
            let curr = fieldErrors;
            let i = 0;
            while (i < issue.path.length) {
              const el = issue.path[i];
              const terminal = i === issue.path.length - 1;
              if (!terminal) {
                curr[el] = curr[el] || { _errors: [] };
              } else {
                curr[el] = curr[el] || { _errors: [] };
                curr[el]._errors.push(mapper(issue));
              }
              curr = curr[el];
              i++;
            }
          }
        }
      };
      processError(this);
      return fieldErrors;
    }
    static assert(value) {
      if (!(value instanceof _ZodError)) {
        throw new Error(`Not a ZodError: ${value}`);
      }
    }
    toString() {
      return this.message;
    }
    get message() {
      return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
      return this.issues.length === 0;
    }
    flatten(mapper = (issue) => issue.message) {
      const fieldErrors = {};
      const formErrors = [];
      for (const sub of this.issues) {
        if (sub.path.length > 0) {
          const firstEl = sub.path[0];
          fieldErrors[firstEl] = fieldErrors[firstEl] || [];
          fieldErrors[firstEl].push(mapper(sub));
        } else {
          formErrors.push(mapper(sub));
        }
      }
      return { formErrors, fieldErrors };
    }
    get formErrors() {
      return this.flatten();
    }
  };
  ZodError.create = (issues) => {
    const error = new ZodError(issues);
    return error;
  };

  // node_modules/zod/v3/locales/en.js
  var errorMap = (issue, _ctx) => {
    let message;
    switch (issue.code) {
      case ZodIssueCode.invalid_type:
        if (issue.received === ZodParsedType.undefined) {
          message = "Required";
        } else {
          message = `Expected ${issue.expected}, received ${issue.received}`;
        }
        break;
      case ZodIssueCode.invalid_literal:
        message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
        break;
      case ZodIssueCode.unrecognized_keys:
        message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
        break;
      case ZodIssueCode.invalid_union:
        message = `Invalid input`;
        break;
      case ZodIssueCode.invalid_union_discriminator:
        message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
        break;
      case ZodIssueCode.invalid_enum_value:
        message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
        break;
      case ZodIssueCode.invalid_arguments:
        message = `Invalid function arguments`;
        break;
      case ZodIssueCode.invalid_return_type:
        message = `Invalid function return type`;
        break;
      case ZodIssueCode.invalid_date:
        message = `Invalid date`;
        break;
      case ZodIssueCode.invalid_string:
        if (typeof issue.validation === "object") {
          if ("includes" in issue.validation) {
            message = `Invalid input: must include "${issue.validation.includes}"`;
            if (typeof issue.validation.position === "number") {
              message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
            }
          } else if ("startsWith" in issue.validation) {
            message = `Invalid input: must start with "${issue.validation.startsWith}"`;
          } else if ("endsWith" in issue.validation) {
            message = `Invalid input: must end with "${issue.validation.endsWith}"`;
          } else {
            util.assertNever(issue.validation);
          }
        } else if (issue.validation !== "regex") {
          message = `Invalid ${issue.validation}`;
        } else {
          message = "Invalid";
        }
        break;
      case ZodIssueCode.too_small:
        if (issue.type === "array")
          message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
        else if (issue.type === "string")
          message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
        else if (issue.type === "number")
          message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
        else if (issue.type === "bigint")
          message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
        else if (issue.type === "date")
          message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
        else
          message = "Invalid input";
        break;
      case ZodIssueCode.too_big:
        if (issue.type === "array")
          message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
        else if (issue.type === "string")
          message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
        else if (issue.type === "number")
          message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
        else if (issue.type === "bigint")
          message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
        else if (issue.type === "date")
          message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
        else
          message = "Invalid input";
        break;
      case ZodIssueCode.custom:
        message = `Invalid input`;
        break;
      case ZodIssueCode.invalid_intersection_types:
        message = `Intersection results could not be merged`;
        break;
      case ZodIssueCode.not_multiple_of:
        message = `Number must be a multiple of ${issue.multipleOf}`;
        break;
      case ZodIssueCode.not_finite:
        message = "Number must be finite";
        break;
      default:
        message = _ctx.defaultError;
        util.assertNever(issue);
    }
    return { message };
  };
  var en_default = errorMap;

  // node_modules/zod/v3/errors.js
  var overrideErrorMap = en_default;
  function setErrorMap(map) {
    overrideErrorMap = map;
  }
  function getErrorMap() {
    return overrideErrorMap;
  }

  // node_modules/zod/v3/helpers/parseUtil.js
  var makeIssue = (params) => {
    const { data, path, errorMaps, issueData } = params;
    const fullPath = [...path, ...issueData.path || []];
    const fullIssue = {
      ...issueData,
      path: fullPath
    };
    if (issueData.message !== void 0) {
      return {
        ...issueData,
        path: fullPath,
        message: issueData.message
      };
    }
    let errorMessage = "";
    const maps = errorMaps.filter((m) => !!m).slice().reverse();
    for (const map of maps) {
      errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
    }
    return {
      ...issueData,
      path: fullPath,
      message: errorMessage
    };
  };
  var EMPTY_PATH = [];
  function addIssueToContext(ctx, issueData) {
    const overrideMap = getErrorMap();
    const issue = makeIssue({
      issueData,
      data: ctx.data,
      path: ctx.path,
      errorMaps: [
        ctx.common.contextualErrorMap,
        // contextual error map is first priority
        ctx.schemaErrorMap,
        // then schema-bound map if available
        overrideMap,
        // then global override map
        overrideMap === en_default ? void 0 : en_default
        // then global default map
      ].filter((x) => !!x)
    });
    ctx.common.issues.push(issue);
  }
  var ParseStatus = class _ParseStatus {
    constructor() {
      this.value = "valid";
    }
    dirty() {
      if (this.value === "valid")
        this.value = "dirty";
    }
    abort() {
      if (this.value !== "aborted")
        this.value = "aborted";
    }
    static mergeArray(status, results) {
      const arrayValue = [];
      for (const s of results) {
        if (s.status === "aborted")
          return INVALID;
        if (s.status === "dirty")
          status.dirty();
        arrayValue.push(s.value);
      }
      return { status: status.value, value: arrayValue };
    }
    static async mergeObjectAsync(status, pairs) {
      const syncPairs = [];
      for (const pair of pairs) {
        const key = await pair.key;
        const value = await pair.value;
        syncPairs.push({
          key,
          value
        });
      }
      return _ParseStatus.mergeObjectSync(status, syncPairs);
    }
    static mergeObjectSync(status, pairs) {
      const finalObject = {};
      for (const pair of pairs) {
        const { key, value } = pair;
        if (key.status === "aborted")
          return INVALID;
        if (value.status === "aborted")
          return INVALID;
        if (key.status === "dirty")
          status.dirty();
        if (value.status === "dirty")
          status.dirty();
        if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
          finalObject[key.value] = value.value;
        }
      }
      return { status: status.value, value: finalObject };
    }
  };
  var INVALID = Object.freeze({
    status: "aborted"
  });
  var DIRTY = (value) => ({ status: "dirty", value });
  var OK = (value) => ({ status: "valid", value });
  var isAborted = (x) => x.status === "aborted";
  var isDirty = (x) => x.status === "dirty";
  var isValid = (x) => x.status === "valid";
  var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

  // node_modules/zod/v3/helpers/errorUtil.js
  var errorUtil;
  (function(errorUtil2) {
    errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
    errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
  })(errorUtil || (errorUtil = {}));

  // node_modules/zod/v3/types.js
  var ParseInputLazyPath = class {
    constructor(parent, value, path, key) {
      this._cachedPath = [];
      this.parent = parent;
      this.data = value;
      this._path = path;
      this._key = key;
    }
    get path() {
      if (!this._cachedPath.length) {
        if (Array.isArray(this._key)) {
          this._cachedPath.push(...this._path, ...this._key);
        } else {
          this._cachedPath.push(...this._path, this._key);
        }
      }
      return this._cachedPath;
    }
  };
  var handleResult = (ctx, result) => {
    if (isValid(result)) {
      return { success: true, data: result.value };
    } else {
      if (!ctx.common.issues.length) {
        throw new Error("Validation failed but no issues detected.");
      }
      return {
        success: false,
        get error() {
          if (this._error)
            return this._error;
          const error = new ZodError(ctx.common.issues);
          this._error = error;
          return this._error;
        }
      };
    }
  };
  function processCreateParams(params) {
    if (!params)
      return {};
    const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
    if (errorMap2 && (invalid_type_error || required_error)) {
      throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
    }
    if (errorMap2)
      return { errorMap: errorMap2, description };
    const customMap = (iss, ctx) => {
      const { message } = params;
      if (iss.code === "invalid_enum_value") {
        return { message: message ?? ctx.defaultError };
      }
      if (typeof ctx.data === "undefined") {
        return { message: message ?? required_error ?? ctx.defaultError };
      }
      if (iss.code !== "invalid_type")
        return { message: ctx.defaultError };
      return { message: message ?? invalid_type_error ?? ctx.defaultError };
    };
    return { errorMap: customMap, description };
  }
  var ZodType = class {
    get description() {
      return this._def.description;
    }
    _getType(input) {
      return getParsedType(input.data);
    }
    _getOrReturnCtx(input, ctx) {
      return ctx || {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      };
    }
    _processInputParams(input) {
      return {
        status: new ParseStatus(),
        ctx: {
          common: input.parent.common,
          data: input.data,
          parsedType: getParsedType(input.data),
          schemaErrorMap: this._def.errorMap,
          path: input.path,
          parent: input.parent
        }
      };
    }
    _parseSync(input) {
      const result = this._parse(input);
      if (isAsync(result)) {
        throw new Error("Synchronous parse encountered promise.");
      }
      return result;
    }
    _parseAsync(input) {
      const result = this._parse(input);
      return Promise.resolve(result);
    }
    parse(data, params) {
      const result = this.safeParse(data, params);
      if (result.success)
        return result.data;
      throw result.error;
    }
    safeParse(data, params) {
      const ctx = {
        common: {
          issues: [],
          async: params?.async ?? false,
          contextualErrorMap: params?.errorMap
        },
        path: params?.path || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      const result = this._parseSync({ data, path: ctx.path, parent: ctx });
      return handleResult(ctx, result);
    }
    "~validate"(data) {
      const ctx = {
        common: {
          issues: [],
          async: !!this["~standard"].async
        },
        path: [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      if (!this["~standard"].async) {
        try {
          const result = this._parseSync({ data, path: [], parent: ctx });
          return isValid(result) ? {
            value: result.value
          } : {
            issues: ctx.common.issues
          };
        } catch (err) {
          if (err?.message?.toLowerCase()?.includes("encountered")) {
            this["~standard"].async = true;
          }
          ctx.common = {
            issues: [],
            async: true
          };
        }
      }
      return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
        value: result.value
      } : {
        issues: ctx.common.issues
      });
    }
    async parseAsync(data, params) {
      const result = await this.safeParseAsync(data, params);
      if (result.success)
        return result.data;
      throw result.error;
    }
    async safeParseAsync(data, params) {
      const ctx = {
        common: {
          issues: [],
          contextualErrorMap: params?.errorMap,
          async: true
        },
        path: params?.path || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
      const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
      return handleResult(ctx, result);
    }
    refine(check, message) {
      const getIssueProperties = (val) => {
        if (typeof message === "string" || typeof message === "undefined") {
          return { message };
        } else if (typeof message === "function") {
          return message(val);
        } else {
          return message;
        }
      };
      return this._refinement((val, ctx) => {
        const result = check(val);
        const setError = () => ctx.addIssue({
          code: ZodIssueCode.custom,
          ...getIssueProperties(val)
        });
        if (typeof Promise !== "undefined" && result instanceof Promise) {
          return result.then((data) => {
            if (!data) {
              setError();
              return false;
            } else {
              return true;
            }
          });
        }
        if (!result) {
          setError();
          return false;
        } else {
          return true;
        }
      });
    }
    refinement(check, refinementData) {
      return this._refinement((val, ctx) => {
        if (!check(val)) {
          ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
          return false;
        } else {
          return true;
        }
      });
    }
    _refinement(refinement) {
      return new ZodEffects({
        schema: this,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect: { type: "refinement", refinement }
      });
    }
    superRefine(refinement) {
      return this._refinement(refinement);
    }
    constructor(def) {
      this.spa = this.safeParseAsync;
      this._def = def;
      this.parse = this.parse.bind(this);
      this.safeParse = this.safeParse.bind(this);
      this.parseAsync = this.parseAsync.bind(this);
      this.safeParseAsync = this.safeParseAsync.bind(this);
      this.spa = this.spa.bind(this);
      this.refine = this.refine.bind(this);
      this.refinement = this.refinement.bind(this);
      this.superRefine = this.superRefine.bind(this);
      this.optional = this.optional.bind(this);
      this.nullable = this.nullable.bind(this);
      this.nullish = this.nullish.bind(this);
      this.array = this.array.bind(this);
      this.promise = this.promise.bind(this);
      this.or = this.or.bind(this);
      this.and = this.and.bind(this);
      this.transform = this.transform.bind(this);
      this.brand = this.brand.bind(this);
      this.default = this.default.bind(this);
      this.catch = this.catch.bind(this);
      this.describe = this.describe.bind(this);
      this.pipe = this.pipe.bind(this);
      this.readonly = this.readonly.bind(this);
      this.isNullable = this.isNullable.bind(this);
      this.isOptional = this.isOptional.bind(this);
      this["~standard"] = {
        version: 1,
        vendor: "zod",
        validate: (data) => this["~validate"](data)
      };
    }
    optional() {
      return ZodOptional.create(this, this._def);
    }
    nullable() {
      return ZodNullable.create(this, this._def);
    }
    nullish() {
      return this.nullable().optional();
    }
    array() {
      return ZodArray.create(this);
    }
    promise() {
      return ZodPromise.create(this, this._def);
    }
    or(option) {
      return ZodUnion.create([this, option], this._def);
    }
    and(incoming) {
      return ZodIntersection.create(this, incoming, this._def);
    }
    transform(transform) {
      return new ZodEffects({
        ...processCreateParams(this._def),
        schema: this,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect: { type: "transform", transform }
      });
    }
    default(def) {
      const defaultValueFunc = typeof def === "function" ? def : () => def;
      return new ZodDefault({
        ...processCreateParams(this._def),
        innerType: this,
        defaultValue: defaultValueFunc,
        typeName: ZodFirstPartyTypeKind.ZodDefault
      });
    }
    brand() {
      return new ZodBranded({
        typeName: ZodFirstPartyTypeKind.ZodBranded,
        type: this,
        ...processCreateParams(this._def)
      });
    }
    catch(def) {
      const catchValueFunc = typeof def === "function" ? def : () => def;
      return new ZodCatch({
        ...processCreateParams(this._def),
        innerType: this,
        catchValue: catchValueFunc,
        typeName: ZodFirstPartyTypeKind.ZodCatch
      });
    }
    describe(description) {
      const This = this.constructor;
      return new This({
        ...this._def,
        description
      });
    }
    pipe(target) {
      return ZodPipeline.create(this, target);
    }
    readonly() {
      return ZodReadonly.create(this);
    }
    isOptional() {
      return this.safeParse(void 0).success;
    }
    isNullable() {
      return this.safeParse(null).success;
    }
  };
  var cuidRegex = /^c[^\s-]{8,}$/i;
  var cuid2Regex = /^[0-9a-z]+$/;
  var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
  var nanoidRegex = /^[a-z0-9_-]{21}$/i;
  var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
  var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
  var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
  var emojiRegex;
  var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
  var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
  var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
  var dateRegex = new RegExp(`^${dateRegexSource}$`);
  function timeRegexSource(args) {
    let secondsRegexSource = `[0-5]\\d`;
    if (args.precision) {
      secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
    } else if (args.precision == null) {
      secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
    }
    const secondsQuantifier = args.precision ? "+" : "?";
    return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
  }
  function timeRegex(args) {
    return new RegExp(`^${timeRegexSource(args)}$`);
  }
  function datetimeRegex(args) {
    let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
    const opts = [];
    opts.push(args.local ? `Z?` : `Z`);
    if (args.offset)
      opts.push(`([+-]\\d{2}:?\\d{2})`);
    regex = `${regex}(${opts.join("|")})`;
    return new RegExp(`^${regex}$`);
  }
  function isValidIP(ip, version2) {
    if ((version2 === "v4" || !version2) && ipv4Regex.test(ip)) {
      return true;
    }
    if ((version2 === "v6" || !version2) && ipv6Regex.test(ip)) {
      return true;
    }
    return false;
  }
  function isValidJWT(jwt, alg) {
    if (!jwtRegex.test(jwt))
      return false;
    try {
      const [header] = jwt.split(".");
      if (!header)
        return false;
      const base642 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
      const decoded = JSON.parse(atob(base642));
      if (typeof decoded !== "object" || decoded === null)
        return false;
      if ("typ" in decoded && decoded?.typ !== "JWT")
        return false;
      if (!decoded.alg)
        return false;
      if (alg && decoded.alg !== alg)
        return false;
      return true;
    } catch {
      return false;
    }
  }
  function isValidCidr(ip, version2) {
    if ((version2 === "v4" || !version2) && ipv4CidrRegex.test(ip)) {
      return true;
    }
    if ((version2 === "v6" || !version2) && ipv6CidrRegex.test(ip)) {
      return true;
    }
    return false;
  }
  var ZodString = class _ZodString extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = String(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.string) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.string,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const status = new ParseStatus();
      let ctx = void 0;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.length < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.length > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "length") {
          const tooBig = input.data.length > check.value;
          const tooSmall = input.data.length < check.value;
          if (tooBig || tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            if (tooBig) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            } else if (tooSmall) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            }
            status.dirty();
          }
        } else if (check.kind === "email") {
          if (!emailRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "email",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "emoji") {
          if (!emojiRegex) {
            emojiRegex = new RegExp(_emojiRegex, "u");
          }
          if (!emojiRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "emoji",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "uuid") {
          if (!uuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "uuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "nanoid") {
          if (!nanoidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "nanoid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid") {
          if (!cuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid2") {
          if (!cuid2Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid2",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ulid") {
          if (!ulidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ulid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "url") {
          try {
            new URL(input.data);
          } catch {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "regex") {
          check.regex.lastIndex = 0;
          const testResult = check.regex.test(input.data);
          if (!testResult) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "regex",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "trim") {
          input.data = input.data.trim();
        } else if (check.kind === "includes") {
          if (!input.data.includes(check.value, check.position)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { includes: check.value, position: check.position },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "toLowerCase") {
          input.data = input.data.toLowerCase();
        } else if (check.kind === "toUpperCase") {
          input.data = input.data.toUpperCase();
        } else if (check.kind === "startsWith") {
          if (!input.data.startsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { startsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "endsWith") {
          if (!input.data.endsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { endsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "datetime") {
          const regex = datetimeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "datetime",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "date") {
          const regex = dateRegex;
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "date",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "time") {
          const regex = timeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "time",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "duration") {
          if (!durationRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "duration",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ip") {
          if (!isValidIP(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ip",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "jwt") {
          if (!isValidJWT(input.data, check.alg)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "jwt",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cidr") {
          if (!isValidCidr(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cidr",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64") {
          if (!base64Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64url") {
          if (!base64urlRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _regex(regex, validation, message) {
      return this.refinement((data) => regex.test(data), {
        validation,
        code: ZodIssueCode.invalid_string,
        ...errorUtil.errToObj(message)
      });
    }
    _addCheck(check) {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    email(message) {
      return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message) {
      return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    emoji(message) {
      return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
    }
    uuid(message) {
      return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
    }
    nanoid(message) {
      return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
    }
    cuid(message) {
      return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
    }
    cuid2(message) {
      return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
    }
    ulid(message) {
      return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
    }
    base64(message) {
      return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
    }
    base64url(message) {
      return this._addCheck({
        kind: "base64url",
        ...errorUtil.errToObj(message)
      });
    }
    jwt(options) {
      return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
    }
    ip(options) {
      return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
    }
    cidr(options) {
      return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
    }
    datetime(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "datetime",
          precision: null,
          offset: false,
          local: false,
          message: options
        });
      }
      return this._addCheck({
        kind: "datetime",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        offset: options?.offset ?? false,
        local: options?.local ?? false,
        ...errorUtil.errToObj(options?.message)
      });
    }
    date(message) {
      return this._addCheck({ kind: "date", message });
    }
    time(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "time",
          precision: null,
          message: options
        });
      }
      return this._addCheck({
        kind: "time",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        ...errorUtil.errToObj(options?.message)
      });
    }
    duration(message) {
      return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
    }
    regex(regex, message) {
      return this._addCheck({
        kind: "regex",
        regex,
        ...errorUtil.errToObj(message)
      });
    }
    includes(value, options) {
      return this._addCheck({
        kind: "includes",
        value,
        position: options?.position,
        ...errorUtil.errToObj(options?.message)
      });
    }
    startsWith(value, message) {
      return this._addCheck({
        kind: "startsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    endsWith(value, message) {
      return this._addCheck({
        kind: "endsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    min(minLength, message) {
      return this._addCheck({
        kind: "min",
        value: minLength,
        ...errorUtil.errToObj(message)
      });
    }
    max(maxLength, message) {
      return this._addCheck({
        kind: "max",
        value: maxLength,
        ...errorUtil.errToObj(message)
      });
    }
    length(len, message) {
      return this._addCheck({
        kind: "length",
        value: len,
        ...errorUtil.errToObj(message)
      });
    }
    /**
     * Equivalent to `.min(1)`
     */
    nonempty(message) {
      return this.min(1, errorUtil.errToObj(message));
    }
    trim() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "trim" }]
      });
    }
    toLowerCase() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toLowerCase" }]
      });
    }
    toUpperCase() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toUpperCase" }]
      });
    }
    get isDatetime() {
      return !!this._def.checks.find((ch) => ch.kind === "datetime");
    }
    get isDate() {
      return !!this._def.checks.find((ch) => ch.kind === "date");
    }
    get isTime() {
      return !!this._def.checks.find((ch) => ch.kind === "time");
    }
    get isDuration() {
      return !!this._def.checks.find((ch) => ch.kind === "duration");
    }
    get isEmail() {
      return !!this._def.checks.find((ch) => ch.kind === "email");
    }
    get isURL() {
      return !!this._def.checks.find((ch) => ch.kind === "url");
    }
    get isEmoji() {
      return !!this._def.checks.find((ch) => ch.kind === "emoji");
    }
    get isUUID() {
      return !!this._def.checks.find((ch) => ch.kind === "uuid");
    }
    get isNANOID() {
      return !!this._def.checks.find((ch) => ch.kind === "nanoid");
    }
    get isCUID() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid");
    }
    get isCUID2() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid2");
    }
    get isULID() {
      return !!this._def.checks.find((ch) => ch.kind === "ulid");
    }
    get isIP() {
      return !!this._def.checks.find((ch) => ch.kind === "ip");
    }
    get isCIDR() {
      return !!this._def.checks.find((ch) => ch.kind === "cidr");
    }
    get isBase64() {
      return !!this._def.checks.find((ch) => ch.kind === "base64");
    }
    get isBase64url() {
      return !!this._def.checks.find((ch) => ch.kind === "base64url");
    }
    get minLength() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxLength() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodString.create = (params) => {
    return new ZodString({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodString,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  function floatSafeRemainder(val, step) {
    const valDecCount = (val.toString().split(".")[1] || "").length;
    const stepDecCount = (step.toString().split(".")[1] || "").length;
    const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
    const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
    const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
    return valInt % stepInt / 10 ** decCount;
  }
  var ZodNumber = class _ZodNumber extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
      this.step = this.multipleOf;
    }
    _parse(input) {
      if (this._def.coerce) {
        input.data = Number(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.number) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.number,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      let ctx = void 0;
      const status = new ParseStatus();
      for (const check of this._def.checks) {
        if (check.kind === "int") {
          if (!util.isInteger(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_type,
              expected: "integer",
              received: "float",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (floatSafeRemainder(input.data, check.value) !== 0) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "finite") {
          if (!Number.isFinite(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_finite,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new _ZodNumber({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new _ZodNumber({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    int(message) {
      return this._addCheck({
        kind: "int",
        message: errorUtil.toString(message)
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    finite(message) {
      return this._addCheck({
        kind: "finite",
        message: errorUtil.toString(message)
      });
    }
    safe(message) {
      return this._addCheck({
        kind: "min",
        inclusive: true,
        value: Number.MIN_SAFE_INTEGER,
        message: errorUtil.toString(message)
      })._addCheck({
        kind: "max",
        inclusive: true,
        value: Number.MAX_SAFE_INTEGER,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
    get isInt() {
      return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
    }
    get isFinite() {
      let max = null;
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
          return true;
        } else if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        } else if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return Number.isFinite(min) && Number.isFinite(max);
    }
  };
  ZodNumber.create = (params) => {
    return new ZodNumber({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodNumber,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  var ZodBigInt = class _ZodBigInt extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
    }
    _parse(input) {
      if (this._def.coerce) {
        try {
          input.data = BigInt(input.data);
        } catch {
          return this._getInvalidInput(input);
        }
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.bigint) {
        return this._getInvalidInput(input);
      }
      let ctx = void 0;
      const status = new ParseStatus();
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              type: "bigint",
              minimum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              type: "bigint",
              maximum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (input.data % check.value !== BigInt(0)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _getInvalidInput(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.bigint,
        received: ctx.parsedType
      });
      return INVALID;
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new _ZodBigInt({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new _ZodBigInt({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodBigInt.create = (params) => {
    return new ZodBigInt({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodBigInt,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  var ZodBoolean = class extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = Boolean(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.boolean) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.boolean,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodBoolean.create = (params) => {
    return new ZodBoolean({
      typeName: ZodFirstPartyTypeKind.ZodBoolean,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  var ZodDate = class _ZodDate extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = new Date(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.date) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.date,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      if (Number.isNaN(input.data.getTime())) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_date
        });
        return INVALID;
      }
      const status = new ParseStatus();
      let ctx = void 0;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.getTime() < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              message: check.message,
              inclusive: true,
              exact: false,
              minimum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.getTime() > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              message: check.message,
              inclusive: true,
              exact: false,
              maximum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return {
        status: status.value,
        value: new Date(input.data.getTime())
      };
    }
    _addCheck(check) {
      return new _ZodDate({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    min(minDate, message) {
      return this._addCheck({
        kind: "min",
        value: minDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    max(maxDate, message) {
      return this._addCheck({
        kind: "max",
        value: maxDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    get minDate() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min != null ? new Date(min) : null;
    }
    get maxDate() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max != null ? new Date(max) : null;
    }
  };
  ZodDate.create = (params) => {
    return new ZodDate({
      checks: [],
      coerce: params?.coerce || false,
      typeName: ZodFirstPartyTypeKind.ZodDate,
      ...processCreateParams(params)
    });
  };
  var ZodSymbol = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.symbol) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.symbol,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodSymbol.create = (params) => {
    return new ZodSymbol({
      typeName: ZodFirstPartyTypeKind.ZodSymbol,
      ...processCreateParams(params)
    });
  };
  var ZodUndefined = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.undefined,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodUndefined.create = (params) => {
    return new ZodUndefined({
      typeName: ZodFirstPartyTypeKind.ZodUndefined,
      ...processCreateParams(params)
    });
  };
  var ZodNull = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.null) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.null,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodNull.create = (params) => {
    return new ZodNull({
      typeName: ZodFirstPartyTypeKind.ZodNull,
      ...processCreateParams(params)
    });
  };
  var ZodAny = class extends ZodType {
    constructor() {
      super(...arguments);
      this._any = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodAny.create = (params) => {
    return new ZodAny({
      typeName: ZodFirstPartyTypeKind.ZodAny,
      ...processCreateParams(params)
    });
  };
  var ZodUnknown = class extends ZodType {
    constructor() {
      super(...arguments);
      this._unknown = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodUnknown.create = (params) => {
    return new ZodUnknown({
      typeName: ZodFirstPartyTypeKind.ZodUnknown,
      ...processCreateParams(params)
    });
  };
  var ZodNever = class extends ZodType {
    _parse(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.never,
        received: ctx.parsedType
      });
      return INVALID;
    }
  };
  ZodNever.create = (params) => {
    return new ZodNever({
      typeName: ZodFirstPartyTypeKind.ZodNever,
      ...processCreateParams(params)
    });
  };
  var ZodVoid = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.void,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodVoid.create = (params) => {
    return new ZodVoid({
      typeName: ZodFirstPartyTypeKind.ZodVoid,
      ...processCreateParams(params)
    });
  };
  var ZodArray = class _ZodArray extends ZodType {
    _parse(input) {
      const { ctx, status } = this._processInputParams(input);
      const def = this._def;
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (def.exactLength !== null) {
        const tooBig = ctx.data.length > def.exactLength.value;
        const tooSmall = ctx.data.length < def.exactLength.value;
        if (tooBig || tooSmall) {
          addIssueToContext(ctx, {
            code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
            minimum: tooSmall ? def.exactLength.value : void 0,
            maximum: tooBig ? def.exactLength.value : void 0,
            type: "array",
            inclusive: true,
            exact: true,
            message: def.exactLength.message
          });
          status.dirty();
        }
      }
      if (def.minLength !== null) {
        if (ctx.data.length < def.minLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.minLength.message
          });
          status.dirty();
        }
      }
      if (def.maxLength !== null) {
        if (ctx.data.length > def.maxLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.maxLength.message
          });
          status.dirty();
        }
      }
      if (ctx.common.async) {
        return Promise.all([...ctx.data].map((item, i) => {
          return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        })).then((result2) => {
          return ParseStatus.mergeArray(status, result2);
        });
      }
      const result = [...ctx.data].map((item, i) => {
        return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      });
      return ParseStatus.mergeArray(status, result);
    }
    get element() {
      return this._def.type;
    }
    min(minLength, message) {
      return new _ZodArray({
        ...this._def,
        minLength: { value: minLength, message: errorUtil.toString(message) }
      });
    }
    max(maxLength, message) {
      return new _ZodArray({
        ...this._def,
        maxLength: { value: maxLength, message: errorUtil.toString(message) }
      });
    }
    length(len, message) {
      return new _ZodArray({
        ...this._def,
        exactLength: { value: len, message: errorUtil.toString(message) }
      });
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodArray.create = (schema, params) => {
    return new ZodArray({
      type: schema,
      minLength: null,
      maxLength: null,
      exactLength: null,
      typeName: ZodFirstPartyTypeKind.ZodArray,
      ...processCreateParams(params)
    });
  };
  function deepPartialify(schema) {
    if (schema instanceof ZodObject) {
      const newShape = {};
      for (const key in schema.shape) {
        const fieldSchema = schema.shape[key];
        newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
      }
      return new ZodObject({
        ...schema._def,
        shape: () => newShape
      });
    } else if (schema instanceof ZodArray) {
      return new ZodArray({
        ...schema._def,
        type: deepPartialify(schema.element)
      });
    } else if (schema instanceof ZodOptional) {
      return ZodOptional.create(deepPartialify(schema.unwrap()));
    } else if (schema instanceof ZodNullable) {
      return ZodNullable.create(deepPartialify(schema.unwrap()));
    } else if (schema instanceof ZodTuple) {
      return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
    } else {
      return schema;
    }
  }
  var ZodObject = class _ZodObject extends ZodType {
    constructor() {
      super(...arguments);
      this._cached = null;
      this.nonstrict = this.passthrough;
      this.augment = this.extend;
    }
    _getCached() {
      if (this._cached !== null)
        return this._cached;
      const shape = this._def.shape();
      const keys = util.objectKeys(shape);
      this._cached = { shape, keys };
      return this._cached;
    }
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.object) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const { status, ctx } = this._processInputParams(input);
      const { shape, keys: shapeKeys } = this._getCached();
      const extraKeys = [];
      if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
        for (const key in ctx.data) {
          if (!shapeKeys.includes(key)) {
            extraKeys.push(key);
          }
        }
      }
      const pairs = [];
      for (const key of shapeKeys) {
        const keyValidator = shape[key];
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (this._def.catchall instanceof ZodNever) {
        const unknownKeys = this._def.unknownKeys;
        if (unknownKeys === "passthrough") {
          for (const key of extraKeys) {
            pairs.push({
              key: { status: "valid", value: key },
              value: { status: "valid", value: ctx.data[key] }
            });
          }
        } else if (unknownKeys === "strict") {
          if (extraKeys.length > 0) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.unrecognized_keys,
              keys: extraKeys
            });
            status.dirty();
          }
        } else if (unknownKeys === "strip") {
        } else {
          throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
        }
      } else {
        const catchall = this._def.catchall;
        for (const key of extraKeys) {
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: catchall._parse(
              new ParseInputLazyPath(ctx, value, ctx.path, key)
              //, ctx.child(key), value, getParsedType(value)
            ),
            alwaysSet: key in ctx.data
          });
        }
      }
      if (ctx.common.async) {
        return Promise.resolve().then(async () => {
          const syncPairs = [];
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
              key,
              value,
              alwaysSet: pair.alwaysSet
            });
          }
          return syncPairs;
        }).then((syncPairs) => {
          return ParseStatus.mergeObjectSync(status, syncPairs);
        });
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get shape() {
      return this._def.shape();
    }
    strict(message) {
      errorUtil.errToObj;
      return new _ZodObject({
        ...this._def,
        unknownKeys: "strict",
        ...message !== void 0 ? {
          errorMap: (issue, ctx) => {
            const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
            if (issue.code === "unrecognized_keys")
              return {
                message: errorUtil.errToObj(message).message ?? defaultError
              };
            return {
              message: defaultError
            };
          }
        } : {}
      });
    }
    strip() {
      return new _ZodObject({
        ...this._def,
        unknownKeys: "strip"
      });
    }
    passthrough() {
      return new _ZodObject({
        ...this._def,
        unknownKeys: "passthrough"
      });
    }
    // const AugmentFactory =
    //   <Def extends ZodObjectDef>(def: Def) =>
    //   <Augmentation extends ZodRawShape>(
    //     augmentation: Augmentation
    //   ): ZodObject<
    //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
    //     Def["unknownKeys"],
    //     Def["catchall"]
    //   > => {
    //     return new ZodObject({
    //       ...def,
    //       shape: () => ({
    //         ...def.shape(),
    //         ...augmentation,
    //       }),
    //     }) as any;
    //   };
    extend(augmentation) {
      return new _ZodObject({
        ...this._def,
        shape: () => ({
          ...this._def.shape(),
          ...augmentation
        })
      });
    }
    /**
     * Prior to zod@1.0.12 there was a bug in the
     * inferred type of merged objects. Please
     * upgrade if you are experiencing issues.
     */
    merge(merging) {
      const merged = new _ZodObject({
        unknownKeys: merging._def.unknownKeys,
        catchall: merging._def.catchall,
        shape: () => ({
          ...this._def.shape(),
          ...merging._def.shape()
        }),
        typeName: ZodFirstPartyTypeKind.ZodObject
      });
      return merged;
    }
    // merge<
    //   Incoming extends AnyZodObject,
    //   Augmentation extends Incoming["shape"],
    //   NewOutput extends {
    //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
    //       ? Augmentation[k]["_output"]
    //       : k extends keyof Output
    //       ? Output[k]
    //       : never;
    //   },
    //   NewInput extends {
    //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
    //       ? Augmentation[k]["_input"]
    //       : k extends keyof Input
    //       ? Input[k]
    //       : never;
    //   }
    // >(
    //   merging: Incoming
    // ): ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"],
    //   NewOutput,
    //   NewInput
    // > {
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    setKey(key, schema) {
      return this.augment({ [key]: schema });
    }
    // merge<Incoming extends AnyZodObject>(
    //   merging: Incoming
    // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
    // ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"]
    // > {
    //   // const mergedShape = objectUtil.mergeShapes(
    //   //   this._def.shape(),
    //   //   merging._def.shape()
    //   // );
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    catchall(index) {
      return new _ZodObject({
        ...this._def,
        catchall: index
      });
    }
    pick(mask) {
      const shape = {};
      for (const key of util.objectKeys(mask)) {
        if (mask[key] && this.shape[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    omit(mask) {
      const shape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (!mask[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    /**
     * @deprecated
     */
    deepPartial() {
      return deepPartialify(this);
    }
    partial(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        const fieldSchema = this.shape[key];
        if (mask && !mask[key]) {
          newShape[key] = fieldSchema;
        } else {
          newShape[key] = fieldSchema.optional();
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    required(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (mask && !mask[key]) {
          newShape[key] = this.shape[key];
        } else {
          const fieldSchema = this.shape[key];
          let newField = fieldSchema;
          while (newField instanceof ZodOptional) {
            newField = newField._def.innerType;
          }
          newShape[key] = newField;
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    keyof() {
      return createZodEnum(util.objectKeys(this.shape));
    }
  };
  ZodObject.create = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.strictCreate = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strict",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.lazycreate = (shape, params) => {
    return new ZodObject({
      shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  var ZodUnion = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const options = this._def.options;
      function handleResults(results) {
        for (const result of results) {
          if (result.result.status === "valid") {
            return result.result;
          }
        }
        for (const result of results) {
          if (result.result.status === "dirty") {
            ctx.common.issues.push(...result.ctx.common.issues);
            return result.result;
          }
        }
        const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return Promise.all(options.map(async (option) => {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          return {
            result: await option._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            }),
            ctx: childCtx
          };
        })).then(handleResults);
      } else {
        let dirty = void 0;
        const issues = [];
        for (const option of options) {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          const result = option._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          });
          if (result.status === "valid") {
            return result;
          } else if (result.status === "dirty" && !dirty) {
            dirty = { result, ctx: childCtx };
          }
          if (childCtx.common.issues.length) {
            issues.push(childCtx.common.issues);
          }
        }
        if (dirty) {
          ctx.common.issues.push(...dirty.ctx.common.issues);
          return dirty.result;
        }
        const unionErrors = issues.map((issues2) => new ZodError(issues2));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
    }
    get options() {
      return this._def.options;
    }
  };
  ZodUnion.create = (types, params) => {
    return new ZodUnion({
      options: types,
      typeName: ZodFirstPartyTypeKind.ZodUnion,
      ...processCreateParams(params)
    });
  };
  var getDiscriminator = (type) => {
    if (type instanceof ZodLazy) {
      return getDiscriminator(type.schema);
    } else if (type instanceof ZodEffects) {
      return getDiscriminator(type.innerType());
    } else if (type instanceof ZodLiteral) {
      return [type.value];
    } else if (type instanceof ZodEnum) {
      return type.options;
    } else if (type instanceof ZodNativeEnum) {
      return util.objectValues(type.enum);
    } else if (type instanceof ZodDefault) {
      return getDiscriminator(type._def.innerType);
    } else if (type instanceof ZodUndefined) {
      return [void 0];
    } else if (type instanceof ZodNull) {
      return [null];
    } else if (type instanceof ZodOptional) {
      return [void 0, ...getDiscriminator(type.unwrap())];
    } else if (type instanceof ZodNullable) {
      return [null, ...getDiscriminator(type.unwrap())];
    } else if (type instanceof ZodBranded) {
      return getDiscriminator(type.unwrap());
    } else if (type instanceof ZodReadonly) {
      return getDiscriminator(type.unwrap());
    } else if (type instanceof ZodCatch) {
      return getDiscriminator(type._def.innerType);
    } else {
      return [];
    }
  };
  var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const discriminator = this.discriminator;
      const discriminatorValue = ctx.data[discriminator];
      const option = this.optionsMap.get(discriminatorValue);
      if (!option) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union_discriminator,
          options: Array.from(this.optionsMap.keys()),
          path: [discriminator]
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return option._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      } else {
        return option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      }
    }
    get discriminator() {
      return this._def.discriminator;
    }
    get options() {
      return this._def.options;
    }
    get optionsMap() {
      return this._def.optionsMap;
    }
    /**
     * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
     * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
     * have a different value for each object in the union.
     * @param discriminator the name of the discriminator property
     * @param types an array of object schemas
     * @param params
     */
    static create(discriminator, options, params) {
      const optionsMap = /* @__PURE__ */ new Map();
      for (const type of options) {
        const discriminatorValues = getDiscriminator(type.shape[discriminator]);
        if (!discriminatorValues.length) {
          throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
        }
        for (const value of discriminatorValues) {
          if (optionsMap.has(value)) {
            throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
          }
          optionsMap.set(value, type);
        }
      }
      return new _ZodDiscriminatedUnion({
        typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
        discriminator,
        options,
        optionsMap,
        ...processCreateParams(params)
      });
    }
  };
  function mergeValues(a, b) {
    const aType = getParsedType(a);
    const bType = getParsedType(b);
    if (a === b) {
      return { valid: true, data: a };
    } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
      const bKeys = util.objectKeys(b);
      const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
      const newObj = { ...a, ...b };
      for (const key of sharedKeys) {
        const sharedValue = mergeValues(a[key], b[key]);
        if (!sharedValue.valid) {
          return { valid: false };
        }
        newObj[key] = sharedValue.data;
      }
      return { valid: true, data: newObj };
    } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
      if (a.length !== b.length) {
        return { valid: false };
      }
      const newArray = [];
      for (let index = 0; index < a.length; index++) {
        const itemA = a[index];
        const itemB = b[index];
        const sharedValue = mergeValues(itemA, itemB);
        if (!sharedValue.valid) {
          return { valid: false };
        }
        newArray.push(sharedValue.data);
      }
      return { valid: true, data: newArray };
    } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
      return { valid: true, data: a };
    } else {
      return { valid: false };
    }
  }
  var ZodIntersection = class extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const handleParsed = (parsedLeft, parsedRight) => {
        if (isAborted(parsedLeft) || isAborted(parsedRight)) {
          return INVALID;
        }
        const merged = mergeValues(parsedLeft.value, parsedRight.value);
        if (!merged.valid) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_intersection_types
          });
          return INVALID;
        }
        if (isDirty(parsedLeft) || isDirty(parsedRight)) {
          status.dirty();
        }
        return { status: status.value, value: merged.data };
      };
      if (ctx.common.async) {
        return Promise.all([
          this._def.left._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }),
          this._def.right._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          })
        ]).then(([left, right]) => handleParsed(left, right));
      } else {
        return handleParsed(this._def.left._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }), this._def.right._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }));
      }
    }
  };
  ZodIntersection.create = (left, right, params) => {
    return new ZodIntersection({
      left,
      right,
      typeName: ZodFirstPartyTypeKind.ZodIntersection,
      ...processCreateParams(params)
    });
  };
  var ZodTuple = class _ZodTuple extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (ctx.data.length < this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        return INVALID;
      }
      const rest = this._def.rest;
      if (!rest && ctx.data.length > this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        status.dirty();
      }
      const items = [...ctx.data].map((item, itemIndex) => {
        const schema = this._def.items[itemIndex] || this._def.rest;
        if (!schema)
          return null;
        return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
      }).filter((x) => !!x);
      if (ctx.common.async) {
        return Promise.all(items).then((results) => {
          return ParseStatus.mergeArray(status, results);
        });
      } else {
        return ParseStatus.mergeArray(status, items);
      }
    }
    get items() {
      return this._def.items;
    }
    rest(rest) {
      return new _ZodTuple({
        ...this._def,
        rest
      });
    }
  };
  ZodTuple.create = (schemas, params) => {
    if (!Array.isArray(schemas)) {
      throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ZodTuple({
      items: schemas,
      typeName: ZodFirstPartyTypeKind.ZodTuple,
      rest: null,
      ...processCreateParams(params)
    });
  };
  var ZodRecord = class _ZodRecord extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const pairs = [];
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      for (const key in ctx.data) {
        pairs.push({
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
          value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (ctx.common.async) {
        return ParseStatus.mergeObjectAsync(status, pairs);
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get element() {
      return this._def.valueType;
    }
    static create(first, second, third) {
      if (second instanceof ZodType) {
        return new _ZodRecord({
          keyType: first,
          valueType: second,
          typeName: ZodFirstPartyTypeKind.ZodRecord,
          ...processCreateParams(third)
        });
      }
      return new _ZodRecord({
        keyType: ZodString.create(),
        valueType: first,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(second)
      });
    }
  };
  var ZodMap = class extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.map) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.map,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      const pairs = [...ctx.data.entries()].map(([key, value], index) => {
        return {
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
          value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
        };
      });
      if (ctx.common.async) {
        const finalMap = /* @__PURE__ */ new Map();
        return Promise.resolve().then(async () => {
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        });
      } else {
        const finalMap = /* @__PURE__ */ new Map();
        for (const pair of pairs) {
          const key = pair.key;
          const value = pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      }
    }
  };
  ZodMap.create = (keyType, valueType, params) => {
    return new ZodMap({
      valueType,
      keyType,
      typeName: ZodFirstPartyTypeKind.ZodMap,
      ...processCreateParams(params)
    });
  };
  var ZodSet = class _ZodSet extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.set) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.set,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const def = this._def;
      if (def.minSize !== null) {
        if (ctx.data.size < def.minSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.minSize.message
          });
          status.dirty();
        }
      }
      if (def.maxSize !== null) {
        if (ctx.data.size > def.maxSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.maxSize.message
          });
          status.dirty();
        }
      }
      const valueType = this._def.valueType;
      function finalizeSet(elements2) {
        const parsedSet = /* @__PURE__ */ new Set();
        for (const element of elements2) {
          if (element.status === "aborted")
            return INVALID;
          if (element.status === "dirty")
            status.dirty();
          parsedSet.add(element.value);
        }
        return { status: status.value, value: parsedSet };
      }
      const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
      if (ctx.common.async) {
        return Promise.all(elements).then((elements2) => finalizeSet(elements2));
      } else {
        return finalizeSet(elements);
      }
    }
    min(minSize, message) {
      return new _ZodSet({
        ...this._def,
        minSize: { value: minSize, message: errorUtil.toString(message) }
      });
    }
    max(maxSize, message) {
      return new _ZodSet({
        ...this._def,
        maxSize: { value: maxSize, message: errorUtil.toString(message) }
      });
    }
    size(size, message) {
      return this.min(size, message).max(size, message);
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodSet.create = (valueType, params) => {
    return new ZodSet({
      valueType,
      minSize: null,
      maxSize: null,
      typeName: ZodFirstPartyTypeKind.ZodSet,
      ...processCreateParams(params)
    });
  };
  var ZodFunction = class _ZodFunction extends ZodType {
    constructor() {
      super(...arguments);
      this.validate = this.implement;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.function) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.function,
          received: ctx.parsedType
        });
        return INVALID;
      }
      function makeArgsIssue(args, error) {
        return makeIssue({
          data: args,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
          issueData: {
            code: ZodIssueCode.invalid_arguments,
            argumentsError: error
          }
        });
      }
      function makeReturnsIssue(returns, error) {
        return makeIssue({
          data: returns,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
          issueData: {
            code: ZodIssueCode.invalid_return_type,
            returnTypeError: error
          }
        });
      }
      const params = { errorMap: ctx.common.contextualErrorMap };
      const fn = ctx.data;
      if (this._def.returns instanceof ZodPromise) {
        const me = this;
        return OK(async function(...args) {
          const error = new ZodError([]);
          const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
            error.addIssue(makeArgsIssue(args, e));
            throw error;
          });
          const result = await Reflect.apply(fn, this, parsedArgs);
          const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
            error.addIssue(makeReturnsIssue(result, e));
            throw error;
          });
          return parsedReturns;
        });
      } else {
        const me = this;
        return OK(function(...args) {
          const parsedArgs = me._def.args.safeParse(args, params);
          if (!parsedArgs.success) {
            throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
          }
          const result = Reflect.apply(fn, this, parsedArgs.data);
          const parsedReturns = me._def.returns.safeParse(result, params);
          if (!parsedReturns.success) {
            throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
          }
          return parsedReturns.data;
        });
      }
    }
    parameters() {
      return this._def.args;
    }
    returnType() {
      return this._def.returns;
    }
    args(...items) {
      return new _ZodFunction({
        ...this._def,
        args: ZodTuple.create(items).rest(ZodUnknown.create())
      });
    }
    returns(returnType) {
      return new _ZodFunction({
        ...this._def,
        returns: returnType
      });
    }
    implement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    strictImplement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    static create(args, returns, params) {
      return new _ZodFunction({
        args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
        returns: returns || ZodUnknown.create(),
        typeName: ZodFirstPartyTypeKind.ZodFunction,
        ...processCreateParams(params)
      });
    }
  };
  var ZodLazy = class extends ZodType {
    get schema() {
      return this._def.getter();
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const lazySchema = this._def.getter();
      return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
    }
  };
  ZodLazy.create = (getter, params) => {
    return new ZodLazy({
      getter,
      typeName: ZodFirstPartyTypeKind.ZodLazy,
      ...processCreateParams(params)
    });
  };
  var ZodLiteral = class extends ZodType {
    _parse(input) {
      if (input.data !== this._def.value) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_literal,
          expected: this._def.value
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
    get value() {
      return this._def.value;
    }
  };
  ZodLiteral.create = (value, params) => {
    return new ZodLiteral({
      value,
      typeName: ZodFirstPartyTypeKind.ZodLiteral,
      ...processCreateParams(params)
    });
  };
  function createZodEnum(values, params) {
    return new ZodEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodEnum,
      ...processCreateParams(params)
    });
  }
  var ZodEnum = class _ZodEnum extends ZodType {
    _parse(input) {
      if (typeof input.data !== "string") {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(this._def.values);
      }
      if (!this._cache.has(input.data)) {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get options() {
      return this._def.values;
    }
    get enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Values() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    extract(values, newDef = this._def) {
      return _ZodEnum.create(values, {
        ...this._def,
        ...newDef
      });
    }
    exclude(values, newDef = this._def) {
      return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
        ...this._def,
        ...newDef
      });
    }
  };
  ZodEnum.create = createZodEnum;
  var ZodNativeEnum = class extends ZodType {
    _parse(input) {
      const nativeEnumValues = util.getValidEnumValues(this._def.values);
      const ctx = this._getOrReturnCtx(input);
      if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(util.getValidEnumValues(this._def.values));
      }
      if (!this._cache.has(input.data)) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get enum() {
      return this._def.values;
    }
  };
  ZodNativeEnum.create = (values, params) => {
    return new ZodNativeEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
      ...processCreateParams(params)
    });
  };
  var ZodPromise = class extends ZodType {
    unwrap() {
      return this._def.type;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.promise,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
      return OK(promisified.then((data) => {
        return this._def.type.parseAsync(data, {
          path: ctx.path,
          errorMap: ctx.common.contextualErrorMap
        });
      }));
    }
  };
  ZodPromise.create = (schema, params) => {
    return new ZodPromise({
      type: schema,
      typeName: ZodFirstPartyTypeKind.ZodPromise,
      ...processCreateParams(params)
    });
  };
  var ZodEffects = class extends ZodType {
    innerType() {
      return this._def.schema;
    }
    sourceType() {
      return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const effect = this._def.effect || null;
      const checkCtx = {
        addIssue: (arg) => {
          addIssueToContext(ctx, arg);
          if (arg.fatal) {
            status.abort();
          } else {
            status.dirty();
          }
        },
        get path() {
          return ctx.path;
        }
      };
      checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
      if (effect.type === "preprocess") {
        const processed = effect.transform(ctx.data, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(processed).then(async (processed2) => {
            if (status.value === "aborted")
              return INVALID;
            const result = await this._def.schema._parseAsync({
              data: processed2,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          });
        } else {
          if (status.value === "aborted")
            return INVALID;
          const result = this._def.schema._parseSync({
            data: processed,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        }
      }
      if (effect.type === "refinement") {
        const executeRefinement = (acc) => {
          const result = effect.refinement(acc, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(result);
          }
          if (result instanceof Promise) {
            throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
          }
          return acc;
        };
        if (ctx.common.async === false) {
          const inner = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          executeRefinement(inner.value);
          return { status: status.value, value: inner.value };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            return executeRefinement(inner.value).then(() => {
              return { status: status.value, value: inner.value };
            });
          });
        }
      }
      if (effect.type === "transform") {
        if (ctx.common.async === false) {
          const base = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (!isValid(base))
            return INVALID;
          const result = effect.transform(base.value, checkCtx);
          if (result instanceof Promise) {
            throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
          }
          return { status: status.value, value: result };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
            if (!isValid(base))
              return INVALID;
            return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
              status: status.value,
              value: result
            }));
          });
        }
      }
      util.assertNever(effect);
    }
  };
  ZodEffects.create = (schema, effect, params) => {
    return new ZodEffects({
      schema,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect,
      ...processCreateParams(params)
    });
  };
  ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
    return new ZodEffects({
      schema,
      effect: { type: "preprocess", transform: preprocess },
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      ...processCreateParams(params)
    });
  };
  var ZodOptional = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.undefined) {
        return OK(void 0);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodOptional.create = (type, params) => {
    return new ZodOptional({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodOptional,
      ...processCreateParams(params)
    });
  };
  var ZodNullable = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.null) {
        return OK(null);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodNullable.create = (type, params) => {
    return new ZodNullable({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodNullable,
      ...processCreateParams(params)
    });
  };
  var ZodDefault = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      let data = ctx.data;
      if (ctx.parsedType === ZodParsedType.undefined) {
        data = this._def.defaultValue();
      }
      return this._def.innerType._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    removeDefault() {
      return this._def.innerType;
    }
  };
  ZodDefault.create = (type, params) => {
    return new ZodDefault({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodDefault,
      defaultValue: typeof params.default === "function" ? params.default : () => params.default,
      ...processCreateParams(params)
    });
  };
  var ZodCatch = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const newCtx = {
        ...ctx,
        common: {
          ...ctx.common,
          issues: []
        }
      };
      const result = this._def.innerType._parse({
        data: newCtx.data,
        path: newCtx.path,
        parent: {
          ...newCtx
        }
      });
      if (isAsync(result)) {
        return result.then((result2) => {
          return {
            status: "valid",
            value: result2.status === "valid" ? result2.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        });
      } else {
        return {
          status: "valid",
          value: result.status === "valid" ? result.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      }
    }
    removeCatch() {
      return this._def.innerType;
    }
  };
  ZodCatch.create = (type, params) => {
    return new ZodCatch({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodCatch,
      catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
      ...processCreateParams(params)
    });
  };
  var ZodNaN = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.nan) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.nan,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
  };
  ZodNaN.create = (params) => {
    return new ZodNaN({
      typeName: ZodFirstPartyTypeKind.ZodNaN,
      ...processCreateParams(params)
    });
  };
  var BRAND = /* @__PURE__ */ Symbol("zod_brand");
  var ZodBranded = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const data = ctx.data;
      return this._def.type._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    unwrap() {
      return this._def.type;
    }
  };
  var ZodPipeline = class _ZodPipeline extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.common.async) {
        const handleAsync = async () => {
          const inResult = await this._def.in._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return DIRTY(inResult.value);
          } else {
            return this._def.out._parseAsync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        };
        return handleAsync();
      } else {
        const inResult = this._def.in._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return {
            status: "dirty",
            value: inResult.value
          };
        } else {
          return this._def.out._parseSync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }
    }
    static create(a, b) {
      return new _ZodPipeline({
        in: a,
        out: b,
        typeName: ZodFirstPartyTypeKind.ZodPipeline
      });
    }
  };
  var ZodReadonly = class extends ZodType {
    _parse(input) {
      const result = this._def.innerType._parse(input);
      const freeze = (data) => {
        if (isValid(data)) {
          data.value = Object.freeze(data.value);
        }
        return data;
      };
      return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodReadonly.create = (type, params) => {
    return new ZodReadonly({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodReadonly,
      ...processCreateParams(params)
    });
  };
  function cleanParams(params, data) {
    const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
    const p2 = typeof p === "string" ? { message: p } : p;
    return p2;
  }
  function custom(check, _params = {}, fatal) {
    if (check)
      return ZodAny.create().superRefine((data, ctx) => {
        const r = check(data);
        if (r instanceof Promise) {
          return r.then((r2) => {
            if (!r2) {
              const params = cleanParams(_params, data);
              const _fatal = params.fatal ?? fatal ?? true;
              ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
            }
          });
        }
        if (!r) {
          const params = cleanParams(_params, data);
          const _fatal = params.fatal ?? fatal ?? true;
          ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
        }
        return;
      });
    return ZodAny.create();
  }
  var late = {
    object: ZodObject.lazycreate
  };
  var ZodFirstPartyTypeKind;
  (function(ZodFirstPartyTypeKind2) {
    ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
    ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
    ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
    ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
    ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
    ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
    ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
    ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
    ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
    ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
    ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
    ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
    ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
    ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
    ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
    ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
    ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
    ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
    ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
    ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
    ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
    ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
    ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
    ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
    ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
    ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
    ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
    ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
    ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
    ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
    ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
    ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
    ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
    ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
    ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
    ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
  })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
  var instanceOfType = (cls, params = {
    message: `Input not instance of ${cls.name}`
  }) => custom((data) => data instanceof cls, params);
  var stringType = ZodString.create;
  var numberType = ZodNumber.create;
  var nanType = ZodNaN.create;
  var bigIntType = ZodBigInt.create;
  var booleanType = ZodBoolean.create;
  var dateType = ZodDate.create;
  var symbolType = ZodSymbol.create;
  var undefinedType = ZodUndefined.create;
  var nullType = ZodNull.create;
  var anyType = ZodAny.create;
  var unknownType = ZodUnknown.create;
  var neverType = ZodNever.create;
  var voidType = ZodVoid.create;
  var arrayType = ZodArray.create;
  var objectType = ZodObject.create;
  var strictObjectType = ZodObject.strictCreate;
  var unionType = ZodUnion.create;
  var discriminatedUnionType = ZodDiscriminatedUnion.create;
  var intersectionType = ZodIntersection.create;
  var tupleType = ZodTuple.create;
  var recordType = ZodRecord.create;
  var mapType = ZodMap.create;
  var setType = ZodSet.create;
  var functionType = ZodFunction.create;
  var lazyType = ZodLazy.create;
  var literalType = ZodLiteral.create;
  var enumType = ZodEnum.create;
  var nativeEnumType = ZodNativeEnum.create;
  var promiseType = ZodPromise.create;
  var effectsType = ZodEffects.create;
  var optionalType = ZodOptional.create;
  var nullableType = ZodNullable.create;
  var preprocessType = ZodEffects.createWithPreprocess;
  var pipelineType = ZodPipeline.create;
  var ostring = () => stringType().optional();
  var onumber = () => numberType().optional();
  var oboolean = () => booleanType().optional();
  var coerce = {
    string: ((arg) => ZodString.create({ ...arg, coerce: true })),
    number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
    boolean: ((arg) => ZodBoolean.create({
      ...arg,
      coerce: true
    })),
    bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
    date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
  };
  var NEVER = INVALID;

  // packages/shared/src/schemas/common.ts
  var zIsoDate = external_exports.union([external_exports.string(), external_exports.date()]);
  var ApiErrorResponseSchema = external_exports.object({
    statusCode: external_exports.number(),
    message: external_exports.union([external_exports.string(), external_exports.array(external_exports.string())]),
    error: external_exports.string().optional()
  });
  var SyncInfoSchema = external_exports.object({
    lastSyncedAt: external_exports.string().nullable()
  });

  // packages/shared/src/schemas/operation.ts
  var OPERATION_STATUSES = ["prepared", "executing", "succeeded", "failed", "cancelled"];
  var OperationStatusSchema = external_exports.enum(OPERATION_STATUSES);
  var OPERATION_OUTCOMES = ["succeeded", "failed"];
  var OperationOutcomeSchema = external_exports.enum(OPERATION_OUTCOMES);
  var OPERATION_CANCEL_CODE = "USER_CANCELLED";
  var OPERATION_LEASE_MS = 30 * 60 * 1e3;
  var OPERATION_CHUNK_MAX_BYTES = 1024 * 1024;
  var OPERATION_CHUNKS_MAX = 1e3;
  var OPERATION_KIND_PATTERN = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/;
  var OperationKindSchema = external_exports.string().regex(OPERATION_KIND_PATTERN, "kind\uB294 owner.work \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  var OPERATION_LOCK_KEY_PATTERN = /^(org|account:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|resource:[a-z][a-z0-9-]*:[^\s]+)$/;
  var OperationLockKeySchema = external_exports.string().max(256).regex(OPERATION_LOCK_KEY_PATTERN, "lockKey\uB294 org \xB7 account:<id> \xB7 resource:<site>:<id> \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  function resourceLockKey(site, id) {
    return `resource:${site}:${id}`;
  }
  var OPERATION_FENCE_LOST_REASONS = ["expired", "terminal", "chunk_conflict"];
  var OperationFenceLostReasonSchema = external_exports.enum(OPERATION_FENCE_LOST_REASONS);
  var OperationInProgressDetailsSchema = external_exports.object({
    operationId: external_exports.string().uuid(),
    kind: OperationKindSchema,
    lockKeys: external_exports.array(OperationLockKeySchema).min(1),
    startedAt: zIsoDate,
    expiresAt: zIsoDate
  }).strict();
  var OperationFenceLostDetailsSchema = external_exports.object({
    operationId: external_exports.string().uuid(),
    reason: OperationFenceLostReasonSchema
  }).strict();
  var JsonObjectSchema = external_exports.record(external_exports.unknown());
  var OPERATION_TOKEN_HEADER = "x-operation-token";
  var OperationWindowSchema = external_exports.object({
    start: external_exports.string().date(),
    end: external_exports.string().date()
  }).strict();
  var OperationChunkKindSchema = external_exports.string().regex(/^[a-z][a-z0-9_]*$/);
  var OperationChunkSequenceSchema = external_exports.coerce.number().int().min(1).max(OPERATION_CHUNKS_MAX);
  var OperationViewSchema = external_exports.object({
    id: external_exports.string().uuid(),
    kind: OperationKindSchema,
    status: OperationStatusSchema,
    lockKeys: external_exports.array(OperationLockKeySchema),
    plan: JsonObjectSchema.nullable(),
    progress: JsonObjectSchema.nullable(),
    result: JsonObjectSchema.nullable(),
    window: OperationWindowSchema.nullable(),
    errorCode: external_exports.string().nullable(),
    errorMessage: external_exports.string().nullable(),
    startedAt: zIsoDate,
    finishedAt: zIsoDate.nullable(),
    expiresAt: zIsoDate,
    /** claim이 지금까지 몇 번 있었나. begin으로 시작한 실행은 1. */
    attempts: external_exports.number().int().nonnegative(),
    maxAttempts: external_exports.number().int().min(1),
    /** `prepared`가 claim될 수 있는 시각. begin으로 시작한 실행은 null. */
    scheduledFor: zIsoDate.nullable()
  }).strict();
  var OperationBeginRequestSchema = external_exports.object({
    kind: OperationKindSchema,
    scope: JsonObjectSchema.default({}),
    idempotencyKey: external_exports.string().min(1).max(128).optional(),
    fileHash: external_exports.string().regex(/^[0-9a-f]{64}$/).optional()
  }).strict();
  var OperationBeginResponseSchema = external_exports.object({
    operation: OperationViewSchema,
    /** fenced 쓰기의 비밀. 확장의 operation client만 들고 있고 화면에 내지 않는다. */
    token: external_exports.string().uuid(),
    reused: external_exports.boolean()
  }).strict();
  var OperationChunkPutRequestSchema = external_exports.object({
    /** payload 직렬화의 SHA-256 hex. */
    checksum: external_exports.string().regex(/^[0-9a-f]{64}$/),
    payload: external_exports.array(external_exports.unknown()),
    progress: JsonObjectSchema.optional()
  }).strict();
  var OperationChunkPutResponseSchema = external_exports.object({
    operationId: external_exports.string().uuid(),
    chunkKind: OperationChunkKindSchema,
    sequence: external_exports.number().int().min(1),
    itemCount: external_exports.number().int().nonnegative(),
    expiresAt: zIsoDate
  }).strict();
  var OperationFinishRequestSchema = external_exports.object({
    outcome: OperationOutcomeSchema,
    errorCode: external_exports.string().min(1).max(64).optional(),
    errorMessage: external_exports.string().max(2e3).optional(),
    window: OperationWindowSchema.optional(),
    result: JsonObjectSchema.optional(),
    /**
     * failed일 때만. 재시도가 남아 있으면(`attempts < maxAttempts`) 같은 실행이 `prepared`로 돌아가
     * `scheduledFor = now + retryAfterMs`가 된다(잠금 유지, 청크 삭제). 없거나 재시도가 없으면 terminal `failed`.
     */
    retryAfterMs: external_exports.number().int().nonnegative().max(7 * 24 * 60 * 60 * 1e3).optional()
  }).strict().refine(
    (value) => value.outcome !== "failed" || value.errorCode !== void 0,
    { message: "failed\uC5D0\uB294 errorCode\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4", path: ["errorCode"] }
  ).refine(
    (value) => value.outcome === "failed" || value.retryAfterMs === void 0,
    { message: "retryAfterMs\uB294 failed\uC5D0\uB9CC \uC4F4\uB2E4", path: ["retryAfterMs"] }
  );
  var OperationFinishResponseSchema = external_exports.object({
    operation: OperationViewSchema
  }).strict();
  var OperationCancelResponseSchema = OperationFinishResponseSchema;
  var OperationListQuerySchema = external_exports.object({
    kinds: external_exports.string().min(1).transform((value) => value.split(",").map((kind) => kind.trim()).filter(Boolean)).pipe(external_exports.array(OperationKindSchema).min(1).max(50)),
    status: OperationStatusSchema.optional(),
    limit: external_exports.coerce.number().int().min(1).max(200).default(50)
  }).strict();
  var OperationNextSchema = external_exports.object({
    kind: OperationKindSchema,
    scope: JsonObjectSchema
  }).strict();
  var OperationListResponseSchema = external_exports.object({
    operations: external_exports.array(OperationViewSchema)
  }).strict();
  var OperationPrepareRequestSchema = external_exports.object({
    kind: OperationKindSchema,
    scope: JsonObjectSchema.default({}),
    idempotencyKey: external_exports.string().min(1).max(128).optional(),
    /** 이 시각 전에는 claim되지 않는다. 없으면 바로. */
    scheduledFor: zIsoDate.optional(),
    /** claim 횟수 상한(재시도 포함). 기본 1 = 재시도 없음. */
    maxAttempts: external_exports.number().int().min(1).max(20).default(1),
    /** 실행을 시작한 사용자(있으면). owner `plan`이 `context.userId`로 받아 plan JSON에 보관한다(KID-354). */
    userId: external_exports.string().uuid().optional()
  }).strict();
  var OperationClaimRequestSchema = external_exports.object({
    kinds: external_exports.array(OperationKindSchema).min(1).max(50),
    /** 로그·진단용. 잠금 판정에는 쓰지 않는다. */
    workerId: external_exports.string().min(1).max(128)
  }).strict();
  var OperationClaimResultSchema = external_exports.object({
    operation: OperationViewSchema,
    token: external_exports.string().uuid()
  }).strict();
  var OperationPlanResultSchema = external_exports.object({
    plan: JsonObjectSchema,
    lockKeys: external_exports.array(OperationLockKeySchema).min(1),
    window: OperationWindowSchema.optional()
  }).strict();
  var OperationStagedChunkSchema = external_exports.object({
    chunkKind: OperationChunkKindSchema,
    sequence: external_exports.number().int().min(1),
    itemCount: external_exports.number().int().nonnegative(),
    payload: external_exports.array(external_exports.unknown())
  }).strict();

  // packages/shared/src/schemas/advertising-operations.ts
  var WING_TRACKED_PRODUCTS_KIND = "advertising.wing_tracked_products";
  var WING_RANK_KIND = "advertising.wing_rank";
  var KEYWORD_SERP_KIND = "advertising.keyword_serp";
  var COMPETITOR_SELLER_IDENTITY_KIND = "advertising.competitor_seller_identity";
  var COMPETITOR_CATALOG_KIND = "advertising.competitor_catalog";
  function canonicalAdvertisingKeyword(value) {
    return value.trim().replace(/\s+/gu, " ").normalize("NFC");
  }
  function advertisingKeywordIdentity(value) {
    return canonicalAdvertisingKeyword(value).toLocaleLowerCase("en-US");
  }
  var keyword = external_exports.string().transform(canonicalAdvertisingKeyword).pipe(external_exports.string().min(1).max(100));
  var productId = external_exports.string().trim().min(1).max(40);
  var isoDay = external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
  function keywordList(max) {
    return external_exports.array(keyword).min(1).max(max).transform((values) => {
      const seen = /* @__PURE__ */ new Set();
      return values.filter((value) => {
        const identity2 = advertisingKeywordIdentity(value);
        if (seen.has(identity2)) return false;
        seen.add(identity2);
        return true;
      });
    });
  }
  var WING_TRACKED_PRODUCTS_MAX_KEYWORDS = 12;
  var WING_TRACKED_PRODUCTS_MAX_PRODUCTS = 300;
  var WingTrackedProductsScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    keywords: keywordList(WING_TRACKED_PRODUCTS_MAX_KEYWORDS)
  }).strict();
  var WingTrackedProductsPlanSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    businessDate: isoDay,
    keywords: external_exports.array(external_exports.string().min(1).max(100)).min(1).max(WING_TRACKED_PRODUCTS_MAX_KEYWORDS),
    maxPages: external_exports.number().int().min(1).max(10),
    products: external_exports.array(external_exports.object({
      productId,
      sourceKeyword: external_exports.string().min(1).max(100).nullable()
    }).strict()).max(WING_TRACKED_PRODUCTS_MAX_PRODUCTS)
  }).strict();
  var WingTrackedProductItemSchema = external_exports.object({
    productId,
    salePriceKrw: external_exports.number().int().nonnegative().max(2147483647).nullable(),
    ratingCount: external_exports.number().int().nonnegative().max(2147483647).nullable(),
    ratingAverage: external_exports.number().min(0).max(5).nullable(),
    pvLast28Day: external_exports.number().int().nonnegative().max(2147483647).nullable(),
    salesLast28d: external_exports.number().int().nonnegative().max(2147483647).nullable(),
    estimatedRevenue28d: external_exports.number().nonnegative().max(2147483647).nullable(),
    conversionRate28d: external_exports.number().min(0).max(1).nullable()
  }).strict();
  var WING_TRACKED_PRODUCTS_CHUNK_KIND = "wing_tracked_search";
  var WingTrackedSearchChunkItemSchema = external_exports.object({
    keyword: external_exports.string().min(1).max(100),
    items: external_exports.array(WingTrackedProductItemSchema).max(WING_TRACKED_PRODUCTS_MAX_PRODUCTS)
  }).strict();
  var WingTrackedProductsResultSchema = external_exports.object({
    businessDate: isoDay,
    expectedProductCount: external_exports.number().int().nonnegative(),
    capturedProductCount: external_exports.number().int().nonnegative()
  }).strict();
  var WING_RANK_MAX_PAGES = 5;
  var WING_RANK_MAX_KEYWORDS = 200;
  var WingRankScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    keywords: keywordList(WING_RANK_MAX_KEYWORDS).optional()
  }).strict();
  var WingRankTargetSchema = external_exports.object({
    vendorItemId: external_exports.string().min(1).max(40),
    productName: external_exports.string().max(500),
    category: external_exports.string().max(1e3).nullable(),
    candidateIndex: external_exports.number().int().nonnegative()
  }).strict();
  var WingRankPlanSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    maxPages: external_exports.number().int().min(1).max(WING_RANK_MAX_PAGES),
    keywords: external_exports.array(external_exports.object({
      keyword: external_exports.string().min(1).max(100),
      targets: external_exports.array(WingRankTargetSchema).min(1)
    }).strict()).min(1).max(WING_RANK_MAX_KEYWORDS),
    selection: external_exports.object({
      productCount: external_exports.number().int().nonnegative(),
      keywordCount: external_exports.number().int().nonnegative(),
      resumed: external_exports.boolean(),
      pendingProductCount: external_exports.number().int().nonnegative()
    }).strict()
  }).strict();
  var nullableMetric = external_exports.number().finite().nullable();
  var WingRankItemSchema = external_exports.object({
    productId: external_exports.string().min(1).max(40),
    itemId: external_exports.string().max(40).nullable(),
    vendorItemId: external_exports.string().max(40).nullable(),
    productName: external_exports.string().max(500).nullable(),
    categoryHierarchy: external_exports.string().max(1e3).nullable(),
    salesRank: external_exports.number().int().min(1),
    salePrice: nullableMetric,
    ratingCount: nullableMetric,
    pvLast28Day: nullableMetric,
    salesLast28d: nullableMetric,
    estimatedRevenue28d: nullableMetric,
    conversionRate28d: nullableMetric
  }).strict();
  var WING_RANK_CHUNK_KIND = "wing_rank_keyword";
  var WingRankChunkItemSchema = external_exports.object({
    keyword: external_exports.string().min(1).max(100),
    capturedAt: external_exports.string().datetime(),
    pagesScanned: external_exports.number().int().nonnegative().max(WING_RANK_MAX_PAGES),
    items: external_exports.array(WingRankItemSchema).max(2e3)
  }).strict();
  var WingRankResultSchema = external_exports.object({
    keywords: external_exports.number().int().nonnegative(),
    rows: external_exports.number().int().nonnegative(),
    rankedCount: external_exports.number().int().nonnegative()
  }).strict();
  var KEYWORD_SERP_MAX_PAGES = 3;
  var KEYWORD_SERP_MAX_KEYWORDS = 100;
  var KeywordSerpScopeSchema = external_exports.object({
    keywords: keywordList(KEYWORD_SERP_MAX_KEYWORDS)
  }).strict();
  var KeywordSerpPlanSchema = external_exports.object({
    keywords: external_exports.array(external_exports.object({
      keyword: external_exports.string().min(1).max(100),
      maxPages: external_exports.number().int().min(1).max(KEYWORD_SERP_MAX_PAGES),
      explicitVendorItemIds: external_exports.array(external_exports.string().min(1).max(40)).max(500)
    }).strict()).min(1).max(KEYWORD_SERP_MAX_KEYWORDS),
    ownItems: external_exports.array(external_exports.object({ vendorItemId: external_exports.string().min(1).max(40), productName: external_exports.string().max(500) }).strict())
  }).strict();
  var KeywordSerpItemSchema = external_exports.object({
    rank: external_exports.number().int().min(1),
    page: external_exports.number().int().min(1).max(KEYWORD_SERP_MAX_PAGES),
    positionInPage: external_exports.number().int().min(1),
    isAd: external_exports.boolean(),
    productId: external_exports.string().min(1).max(40),
    itemId: external_exports.string().max(40).nullable(),
    vendorItemId: external_exports.string().max(40).nullable(),
    name: external_exports.string().max(300).nullable(),
    priceKrw: external_exports.number().int().nonnegative().nullable(),
    reviewCount: external_exports.number().int().nonnegative().nullable(),
    ratingScore: external_exports.number().min(0).max(5).nullable(),
    imageUrl: external_exports.string().max(2e3).nullable(),
    link: external_exports.string().max(2e3).nullable()
  }).strict();
  var KEYWORD_SERP_STOP_REASONS = ["page_limit", "empty_page", "provider_wall", "invalid_result"];
  var KEYWORD_SERP_CHUNK_KIND = "keyword_serp";
  var KeywordSerpChunkItemSchema = external_exports.object({
    keyword: external_exports.string().min(1).max(100),
    capturedAt: external_exports.string().datetime(),
    pagesScanned: external_exports.number().int().min(1).max(KEYWORD_SERP_MAX_PAGES),
    stopReason: external_exports.enum(KEYWORD_SERP_STOP_REASONS),
    items: external_exports.array(KeywordSerpItemSchema).min(1).max(1e3)
  }).strict();
  var KeywordSerpResultSchema = external_exports.object({
    keywords: external_exports.number().int().nonnegative(),
    items: external_exports.number().int().nonnegative(),
    rankRows: external_exports.number().int().nonnegative()
  }).passthrough();
  var COMPETITOR_SELLER_IDENTITY_MAX_TARGETS = 200;
  var CompetitorSellerIdentityScopeSchema = external_exports.object({
    keywords: keywordList(KEYWORD_SERP_MAX_KEYWORDS).optional()
  }).strict();
  var CompetitorSellerIdentityTargetSchema = external_exports.object({
    keyword: external_exports.string().min(1).max(100),
    productKey: external_exports.string().min(1).max(2100),
    productId: external_exports.string().max(40).nullable(),
    vendorItemId: external_exports.string().max(40).nullable(),
    name: external_exports.string().max(300),
    link: external_exports.string().url().max(2e3),
    rank: external_exports.number().int().positive(),
    matchScore: external_exports.number().finite()
  }).strict();
  var CompetitorSellerIdentityPlanSchema = external_exports.object({
    targets: external_exports.array(CompetitorSellerIdentityTargetSchema).max(COMPETITOR_SELLER_IDENTITY_MAX_TARGETS),
    excludedTargetCount: external_exports.number().int().nonnegative()
  }).strict();
  function isSellerStoreUrl(value, sellerId2) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "shop.coupang.com" && (url.pathname === `/${sellerId2}` || url.pathname === `/vid/${sellerId2}`);
    } catch {
      return false;
    }
  }
  var COMPETITOR_SELLER_IDENTITY_CHUNK_KIND = "seller_identity";
  var CompetitorSellerIdentityItemSchema = external_exports.object({
    keyword: external_exports.string().min(1).max(100),
    productKey: external_exports.string().min(1).max(2100),
    productId: external_exports.string().max(40).nullable(),
    vendorItemId: external_exports.string().max(40).nullable(),
    link: external_exports.string().url().max(2e3),
    sellerName: external_exports.string().min(1).max(120),
    sellerId: external_exports.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    sellerStoreUrl: external_exports.string().url().max(200),
    capturedAt: external_exports.string().datetime()
  }).strict().refine((item) => isSellerStoreUrl(item.sellerStoreUrl, item.sellerId), { message: "sellerStoreUrl\uC740 \uADF8 \uD310\uB9E4\uC790\uC758 shop.coupang.com \uC8FC\uC18C\uC5EC\uC57C \uD569\uB2C8\uB2E4", path: ["sellerStoreUrl"] });
  var CompetitorSellerIdentityResultSchema = external_exports.object({
    targets: external_exports.number().int().nonnegative(),
    identities: external_exports.number().int().nonnegative(),
    resolvedProductCount: external_exports.number().int().nonnegative()
  }).passthrough();
  var COMPETITOR_CATALOG_MAX_TARGETS = 20;
  var COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS = 500;
  var COMPETITOR_CATALOG_MAX_PRODUCTS = 100;
  var sellerId = external_exports.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/u);
  var sellerStoreUrl = external_exports.string().trim().url().max(2e3).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "shop.coupang.com";
    } catch {
      return false;
    }
  }, "\uD310\uB9E4\uC790\uC0F5 \uC8FC\uC18C\uB294 shop.coupang.com\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  var boundedCount = external_exports.number().int().nonnegative().max(2147483647);
  var CompetitorCatalogScopeSchema = external_exports.object({
    sellerId: sellerId.optional(),
    rankEnrichment: external_exports.boolean().optional()
  }).strict().refine((scope) => !(scope.sellerId && scope.rankEnrichment), { message: "\uD310\uB9E4\uC790 \uD558\uB098 \uC218\uC9D1\uC740 \uBCF4\uAC15 \uC5F0\uC1C4\uAC00 \uC544\uB2D9\uB2C8\uB2E4", path: ["rankEnrichment"] });
  var CompetitorCatalogTargetSchema = external_exports.object({
    sellerId,
    sellerName: external_exports.string().trim().min(1).max(300),
    sellerStoreUrl,
    keyword: external_exports.string().min(1).max(100)
  }).strict();
  var CompetitorCatalogPlanSchema = external_exports.object({
    targets: external_exports.array(CompetitorCatalogTargetSchema).max(COMPETITOR_CATALOG_MAX_TARGETS),
    productLimit: external_exports.union([external_exports.literal(COMPETITOR_CATALOG_MAX_PRODUCTS), external_exports.literal(COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS)])
  }).strict();
  var CompetitorCatalogProductSchema = external_exports.object({
    sourceRank: external_exports.number().int().min(1).max(COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS),
    productId: external_exports.string().trim().min(1).max(200).nullable(),
    itemId: external_exports.string().trim().min(1).max(200).nullable(),
    vendorItemId: external_exports.string().trim().min(1).max(200).nullable(),
    name: external_exports.string().trim().min(1).max(500),
    priceKrw: boundedCount.nullable(),
    reviewCount: boundedCount.nullable(),
    imageUrl: external_exports.string().trim().max(2e3).nullable(),
    link: external_exports.string().trim().max(2e3).nullable()
  }).strict().refine((product) => Boolean(product.productId || product.itemId || product.vendorItemId), {
    message: "\uACBD\uC7C1\uC0AC \uC0C1\uD488\uC740 \uC0C1\uD488\xB7\uC544\uC774\uD15C\xB7\uC635\uC158 ID \uC911 \uD558\uB098\uAC00 \uC788\uC5B4\uC57C \uD569\uB2C8\uB2E4",
    path: ["productId"]
  });
  var COMPETITOR_CATALOG_CHUNK_KIND = "seller_catalog";
  var CompetitorCatalogItemSchema = external_exports.object({
    keyword: external_exports.string().min(1).max(100),
    sellerId,
    sellerName: external_exports.string().trim().min(1).max(300),
    sellerStoreUrl,
    totalProductCount: boundedCount.nullable(),
    collectedProductCount: external_exports.number().int().min(1).max(COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS),
    isTruncated: external_exports.boolean(),
    sort: external_exports.literal("newest"),
    capturedAt: external_exports.string().datetime(),
    products: external_exports.array(CompetitorCatalogProductSchema).min(1).max(COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS)
  }).strict().refine((catalog) => catalog.collectedProductCount === catalog.products.length, {
    message: "collectedProductCount\uB294 \uC77D\uC740 \uC0C1\uD488 \uC218\uC640 \uAC19\uC544\uC57C \uD569\uB2C8\uB2E4",
    path: ["collectedProductCount"]
  });
  var CompetitorCatalogResultSchema = external_exports.object({
    targets: external_exports.number().int().nonnegative(),
    captured: external_exports.number().int().nonnegative(),
    ignored: external_exports.number().int().nonnegative()
  }).passthrough();
  var WING_VENDOR_IDENTITY_MISMATCH = "WING_VENDOR_IDENTITY_MISMATCH";
  var WING_ITEMWINNER_KIND = "advertising.wing_itemwinner";
  var WingItemwinnerScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid()
  }).strict();
  var WING_ITEMWINNER_MAX_ITEMS = 1e3;
  var WING_ITEMWINNER_CHUNK_KIND = "itemwinner_rows";
  var WING_ITEMWINNER_PAGE_CHUNK_KIND = "itemwinner_page";
  var WingItemwinnerRowSchema = external_exports.object({
    vendorItemId: external_exports.string().regex(/^\d+$/),
    productName: external_exports.string().min(1).max(80),
    isWinner: external_exports.boolean(),
    myPrice: external_exports.number().int(),
    winnerPrice: external_exports.number().int(),
    salesQty: external_exports.number().int().nonnegative(),
    suppressed: external_exports.boolean(),
    providerWinnerStatus: external_exports.boolean()
  }).strict();
  var vendorId = external_exports.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
  var WingItemwinnerPlanSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    vendorId,
    businessDate: external_exports.string().date()
  }).strict();
  var WingItemwinnerPageSchema = external_exports.object({
    totalSize: external_exports.number().int().min(0).max(WING_ITEMWINNER_MAX_ITEMS),
    observedAt: external_exports.string().datetime({ offset: true }),
    /** 확장이 이 목록을 읽은 Wing 세션의 판매자 식별자. */
    vendorId
  }).strict();
  var WingItemwinnerListingObservationSchema = external_exports.object({
    listingId: external_exports.string().uuid(),
    isOfferWinner: external_exports.boolean().nullable(),
    lastObservedAt: external_exports.string().datetime({ offset: true })
  }).strict();
  var WingItemwinnerKpisSchema = external_exports.object({
    winners: external_exports.number().int().nonnegative(),
    suppressed: external_exports.number().int().nonnegative(),
    losers: external_exports.number().int().nonnegative()
  }).strict();
  var WingItemwinnerResultSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    businessDate: external_exports.string().date(),
    observedAt: external_exports.string().datetime({ offset: true }),
    rowCount: external_exports.number().int().nonnegative(),
    matchedCount: external_exports.number().int().nonnegative(),
    unmatchedCount: external_exports.number().int().nonnegative(),
    kpis: WingItemwinnerKpisSchema,
    listingObservations: external_exports.array(WingItemwinnerListingObservationSchema)
  }).strict();
  var WING_TRAFFIC_KIND = "advertising.wing_traffic";
  var WING_TRAFFIC_MAX_PAGES_PER_DAY = 100;
  var calendarDate = external_exports.string().date();
  var metric = external_exports.number().finite().int().safe();
  var providerRatio = external_exports.number().finite().nullable();
  var WingTrafficScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    startDate: calendarDate.optional(),
    endDate: calendarDate.optional()
  }).strict().refine((scope) => !scope.startDate || !scope.endDate || scope.startDate <= scope.endDate, {
    message: "\uC2DC\uC791\uC77C\uC774 \uC885\uB8CC\uC77C\uBCF4\uB2E4 \uB2A6\uC2B5\uB2C8\uB2E4",
    path: ["endDate"]
  });
  var WingTrafficPlanSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    vendorId: external_exports.string().min(1),
    startDate: calendarDate,
    endDate: calendarDate,
    expectedDates: external_exports.array(calendarDate).min(1).max(366),
    maxPagesPerDay: external_exports.number().int().min(1).max(WING_TRAFFIC_MAX_PAGES_PER_DAY),
    /** 실행이 시작된 시각. 그 뒤 카탈로그에 들어온 리스팅은 빠진 날을 0으로 채우지 않는다(owner가 쓴다). */
    startedAt: external_exports.string().datetime({ offset: true })
  }).strict();
  var WING_TRAFFIC_ROWS_CHUNK_KIND = "traffic_rows";
  var WING_TRAFFIC_DAY_CHUNK_KIND = "traffic_days";
  var WING_TRAFFIC_PERIOD_CHUNK_KIND = "traffic_period";
  var WingTrafficRowSchema = external_exports.object({
    businessDate: calendarDate,
    vendorItemId: external_exports.string().regex(/^[1-9]\d*$/),
    /** Wing 등록상품 id(inventoryId). 옵션이 맞지 않을 때 listing으로 맞추는 근거. */
    productId: external_exports.string().regex(/^[1-9]\d*$/).nullable(),
    visitors: metric,
    views: metric,
    cartAdds: metric,
    orders: metric,
    salesQty: metric,
    revenue: metric
  }).strict();
  var AdTrafficAccountSummarySchema = external_exports.object({
    visitors: metric,
    views: metric,
    cartAdds: metric,
    orders: metric,
    salesQty: metric,
    revenue: metric,
    providerConversionRate: providerRatio
  }).strict();
  var WingTrafficDaySchema = external_exports.object({
    businessDate: calendarDate,
    pages: external_exports.number().int().min(1).max(WING_TRAFFIC_MAX_PAGES_PER_DAY),
    rows: external_exports.number().int().nonnegative(),
    /** Wing이 그날 결과 0개라고 답했다(0행이 수집 실패가 아니라는 증거). */
    explicitEmpty: external_exports.boolean(),
    capturedAt: external_exports.string().datetime({ offset: true }),
    accountSummary: AdTrafficAccountSummarySchema
  }).strict();
  var WingTrafficPeriodSchema = external_exports.object({
    startDate: calendarDate,
    endDate: calendarDate,
    capturedAt: external_exports.string().datetime({ offset: true }),
    /** 확장이 이 창을 읽은 Wing 세션의 판매자 식별자. 빈 날만 있는 창도 이것으로 계정을 확인한다. */
    vendorId: external_exports.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
    accountSummary: AdTrafficAccountSummarySchema
  }).strict();
  var AdTrafficSourceAccountDailySchema = external_exports.object({
    businessDate: calendarDate,
    observedAt: external_exports.string().datetime({ offset: true }),
    operationId: external_exports.string().uuid(),
    providerConversionRate: providerRatio,
    visitors: metric,
    views: metric,
    cartAdds: metric,
    orders: metric,
    salesQty: metric,
    revenue: metric
  }).strict();
  var WingTrafficPeriodSummarySchema = external_exports.object({
    startDate: calendarDate,
    endDate: calendarDate,
    observedAt: external_exports.string().datetime({ offset: true }),
    operationId: external_exports.string().uuid(),
    accountSummary: AdTrafficAccountSummarySchema
  }).strict();
  var WingTrafficResultSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    requestedStartDate: calendarDate,
    requestedEndDate: calendarDate,
    /** 이 실행이 확정한 날짜(plan 순서). 쿠팡이 아직 공개하지 않은 뒷날은 빠진다. */
    confirmedDates: external_exports.array(calendarDate).min(1),
    /** Wing이 0개라고 답한 확정 날짜. */
    providerBackedEmptyDates: external_exports.array(calendarDate),
    accountDaily: external_exports.array(AdTrafficSourceAccountDailySchema),
    periodSummary: WingTrafficPeriodSummarySchema,
    rowCount: external_exports.number().int().nonnegative(),
    matchedCount: external_exports.number().int().nonnegative(),
    unmatchedCount: external_exports.number().int().nonnegative(),
    /**
     * 날짜마다 카탈로그에 맞지 않은 Wing 옵션 id(KID-217). 그 뒤 카탈로그에 그 옵션이 들어오면(늦게 커밋된 가져오기·
     * 다시 활성화) 그 계정의 그 날짜는 행이 합계에서 빠진 날이므로 수집 안 된 날로 친다.
     */
    unmatchedOptionIdsByDate: external_exports.record(calendarDate, external_exports.array(external_exports.string()))
  }).strict();
  var WingTrafficProgressSchema = external_exports.object({
    current: calendarDate.nullable(),
    confirmedDays: external_exports.number().int().nonnegative(),
    plannedDays: external_exports.number().int().nonnegative(),
    rows: external_exports.number().int().nonnegative()
  }).strict();
  var reconciliationMetricSchema = external_exports.object({
    dailySum: metric.nullable(),
    periodValue: metric.nullable()
  }).strict();
  var AdTrafficSourceReconciliationSchema = external_exports.object({
    views: reconciliationMetricSchema,
    cartAdds: reconciliationMetricSchema,
    orders: reconciliationMetricSchema,
    salesQty: reconciliationMetricSchema,
    revenue: reconciliationMetricSchema
  }).strict();
  var AdTrafficSourceCoverageSchema = external_exports.object({
    from: calendarDate,
    to: calendarDate,
    targetDays: external_exports.number().int().nonnegative(),
    completedDays: external_exports.number().int().nonnegative(),
    missingDates: external_exports.array(calendarDate)
  }).strict();
  var AdTrafficSourcePublishedSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    accountDaily: external_exports.array(AdTrafficSourceAccountDailySchema),
    periodSummary: WingTrafficPeriodSummarySchema.nullable(),
    coverage: AdTrafficSourceCoverageSchema,
    reconciliation: AdTrafficSourceReconciliationSchema
  }).strict();

  // extensions/src/collectors/collector.ts
  function attentionReporter(report, base) {
    let since = null;
    return async (attention) => {
      if (!report) return;
      if (!attention) {
        since = null;
        await report({ ...base, attention: null });
        return;
      }
      since ??= (/* @__PURE__ */ new Date()).toISOString();
      await report({ ...base, attention: { ...attention, since } });
    };
  }

  // extensions/src/collectors/advertising.competitor_catalog/index.ts
  var advertisingCompetitorCatalogCollector = {
    kind: COMPETITOR_CATALOG_KIND,
    site: "coupang-shop",
    async *collect(plan, site, { signal, report }) {
      try {
        for (const [index, target] of plan.targets.entries()) {
          if (signal.aborted) return;
          const catalog = await site.catalog(target, plan.productLimit, {
            onAttention: attentionReporter(report, { current: index, total: plan.targets.length, label: target.sellerName })
          });
          yield {
            chunkKind: COMPETITOR_CATALOG_CHUNK_KIND,
            payload: [catalog],
            progress: { current: index + 1, total: plan.targets.length, label: target.sellerName }
          };
        }
      } finally {
        await site.close();
      }
    }
  };
  registerCollector(advertisingCompetitorCatalogCollector);

  // extensions/src/collectors/advertising.competitor_seller_identity/index.ts
  var advertisingCompetitorSellerIdentityCollector = {
    kind: COMPETITOR_SELLER_IDENTITY_KIND,
    site: "coupang-product",
    async *collect(plan, site, { signal, report }) {
      const byProduct = /* @__PURE__ */ new Map();
      for (const target of plan.targets) byProduct.set(target.productKey, [...byProduct.get(target.productKey) ?? [], target]);
      try {
        let index = 0;
        for (const [productKey, targets] of byProduct) {
          if (signal.aborted) return;
          const first = targets[0];
          const seller = await site.sellerIdentity(first.link, {
            label: first.name || productKey,
            onAttention: attentionReporter(report, { current: index, total: byProduct.size, label: first.name || productKey })
          });
          index += 1;
          const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
          const items = seller ? targets.map((target) => ({
            keyword: target.keyword,
            productKey: target.productKey,
            productId: target.productId,
            vendorItemId: target.vendorItemId,
            link: target.link,
            ...seller,
            capturedAt
          })) : [];
          yield {
            chunkKind: COMPETITOR_SELLER_IDENTITY_CHUNK_KIND,
            payload: items,
            progress: { current: index, total: byProduct.size, label: first.name || productKey }
          };
        }
      } finally {
        await site.close();
      }
    }
  };
  registerCollector(advertisingCompetitorSellerIdentityCollector);

  // extensions/src/collectors/advertising.keyword_serp/index.ts
  var advertisingKeywordSerpCollector = {
    kind: KEYWORD_SERP_KIND,
    site: "coupang-search",
    async *collect(plan, site, { signal, report }) {
      try {
        for (const [index, { keyword: keyword2, maxPages }] of plan.keywords.entries()) {
          if (signal.aborted) return;
          const read = await site.serp(keyword2, maxPages, {
            onAttention: attentionReporter(report, { current: index, total: plan.keywords.length, label: keyword2 })
          });
          const chunk = { keyword: keyword2, capturedAt: (/* @__PURE__ */ new Date()).toISOString(), ...read };
          yield {
            chunkKind: KEYWORD_SERP_CHUNK_KIND,
            payload: [chunk],
            progress: { current: index + 1, total: plan.keywords.length, label: keyword2 }
          };
        }
      } finally {
        await site.closeSerp();
      }
    }
  };
  registerCollector(advertisingKeywordSerpCollector);

  // extensions/src/core/errors.ts
  var ErrorEnvelopeSchema = external_exports.object({
    statusCode: external_exports.number().int().min(400).max(599),
    code: external_exports.string().min(1),
    kind: external_exports.string(),
    message: external_exports.string(),
    errors: external_exports.array(external_exports.unknown()).optional(),
    details: external_exports.record(external_exports.string(), external_exports.unknown()).optional()
  }).passthrough();
  var RuntimeError = class extends Error {
    constructor(code, message, details = null, cause) {
      super(message);
      this.code = code;
      this.details = details;
      this.cause = cause;
      this.name = "RuntimeError";
    }
    code;
    details;
    cause;
  };
  function parseErrorEnvelope(body) {
    const parsed2 = ErrorEnvelopeSchema.safeParse(body);
    return parsed2.success ? parsed2.data : null;
  }
  function isRuntimeError(value) {
    return value instanceof RuntimeError;
  }

  // extensions/src/collectors/chunk-items.ts
  var encoder = new TextEncoder();
  var ChunkBuffer = class {
    // "[]"
    constructor(options) {
      this.options = options;
    }
    options;
    items = [];
    bytes = 2;
    /** 넣고 나서 내보낼 payload(있으면). */
    push(item) {
      const maxBytes = this.options.maxBytes ?? OPERATION_CHUNK_MAX_BYTES;
      const itemBytes = encoder.encode(JSON.stringify(item)).byteLength;
      if (itemBytes + 2 > maxBytes) {
        throw new RuntimeError("RUNTIME_CHUNK_TOO_LARGE", `${this.options.label} \uD558\uB098\uAC00 \uCCAD\uD06C \uC0C1\uD55C(${maxBytes}\uBC14\uC774\uD2B8)\uC744 \uB118\uC2B5\uB2C8\uB2E4.`, { bytes: itemBytes });
      }
      let flushed = null;
      const separator = this.items.length > 0 ? 1 : 0;
      if (this.items.length >= this.options.maxItems || this.bytes + separator + itemBytes > maxBytes) flushed = this.flush();
      this.bytes += (this.items.length > 0 ? 1 : 0) + itemBytes;
      this.items.push(item);
      if (this.items.length >= this.options.maxItems) return flushed ?? this.flush();
      return flushed;
    }
    /** 남은 원소(없으면 null). */
    flush() {
      if (this.items.length === 0) return null;
      const out = this.items;
      this.items = [];
      this.bytes = 2;
      return out;
    }
  };

  // extensions/src/collectors/advertising.wing_itemwinner/index.ts
  var RUNTIME_PLAN_INVALID = "RUNTIME_PLAN_INVALID";
  var CHUNK_ITEMS = 500;
  var wingItemwinnerCollector = {
    kind: WING_ITEMWINNER_KIND,
    site: "wing-itemwinner",
    async *collect(rawPlan, site, { signal }) {
      const parsed2 = WingItemwinnerPlanSchema.safeParse(rawPlan);
      if (!parsed2.success) {
        throw new RuntimeError(RUNTIME_PLAN_INVALID, "\uC544\uC774\uD15C\uC704\uB108 \uC218\uC9D1 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: WING_ITEMWINNER_KIND });
      }
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, "Wing \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: WING_ITEMWINNER_KIND });
      if (signal.aborted) return;
      const vendorId2 = await site.readVendorId();
      if (vendorId2 !== parsed2.data.vendorId) {
        throw new RuntimeError(WING_VENDOR_IDENTITY_MISMATCH, "Wing\uC5D0 \uB2E4\uB978 \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uB3FC \uC788\uC2B5\uB2C8\uB2E4. \uC218\uC9D1\uD560 \uACC4\uC815\uC73C\uB85C \uB2E4\uC2DC \uB85C\uADF8\uC778\uD55C \uB4A4 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.", {
          plannedVendorId: parsed2.data.vendorId,
          observedVendorId: vendorId2
        });
      }
      const list = await site.readItemwinnerList();
      const observedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (signal.aborted) return;
      const buffer = new ChunkBuffer({ maxItems: CHUNK_ITEMS, label: "\uC544\uC774\uD15C\uC704\uB108 \uD589" });
      for (const row of list.rows) {
        const full = buffer.push(row);
        if (full) yield rowsChunk(full);
      }
      const rest = buffer.flush();
      if (rest) yield rowsChunk(rest);
      const marker = { totalSize: list.totalSize, observedAt, vendorId: vendorId2 };
      yield { chunkKind: WING_ITEMWINNER_PAGE_CHUNK_KIND, payload: [marker], progress: { rows: list.rows.length } };
    }
  };
  function rowsChunk(payload) {
    return { chunkKind: WING_ITEMWINNER_CHUNK_KIND, payload };
  }
  registerCollector(wingItemwinnerCollector);

  // extensions/src/collectors/wing-search-keyword.ts
  var ADVERTISING_COLLECTION_INCOMPLETE = "ADVERTISING_COLLECTION_INCOMPLETE";
  async function readWingSearchKeyword(site, keyword2, maxPages, signal) {
    const rows = /* @__PURE__ */ new Map();
    let searchPage = 0;
    let pagesScanned = 0;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      if (signal.aborted) return null;
      const page = await site.searchPage(keyword2, searchPage);
      pagesScanned += 1;
      for (const row of page.rows) {
        const key = `${row.productId}:${row.itemId ?? ""}:${row.vendorItemId ?? ""}`;
        if (!rows.has(key)) rows.set(key, row);
      }
      if (page.rows.length === 0 || page.nextSearchPage === null) break;
      if (page.nextSearchPage === searchPage) {
        if (pageIndex + 1 < maxPages) {
          throw new RuntimeError(ADVERTISING_COLLECTION_INCOMPLETE, `Wing \uAC80\uC0C9 '${keyword2}'\uC758 \uB2E4\uC74C \uCABD\uC774 \uB118\uC5B4\uAC00\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.`, { keyword: keyword2 });
        }
        break;
      }
      searchPage = page.nextSearchPage;
    }
    return { rows: [...rows.values()], pagesScanned };
  }
  function boundedInteger(value) {
    return value !== null && Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
  }
  function boundedNumber(value, minimum, maximum) {
    return value !== null && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
  }

  // extensions/src/collectors/advertising.wing_rank/index.ts
  var advertisingWingRankCollector = {
    kind: WING_RANK_KIND,
    site: "wing-search",
    async *collect(plan, site, { signal }) {
      for (const [index, { keyword: keyword2 }] of plan.keywords.entries()) {
        const read = await readWingSearchKeyword(site, keyword2, plan.maxPages, signal);
        if (read === null) return;
        const chunk = {
          keyword: keyword2,
          capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
          pagesScanned: read.pagesScanned,
          items: rankBySales(read.rows)
        };
        yield {
          chunkKind: WING_RANK_CHUNK_KIND,
          payload: [chunk],
          progress: { current: index + 1, total: plan.keywords.length, label: keyword2 }
        };
      }
    }
  };
  function rankBySales(rows) {
    return [...rows].sort((a, b) => (b.salesLast28d ?? 0) - (a.salesLast28d ?? 0) || (b.estimatedRevenue28d ?? 0) - (a.estimatedRevenue28d ?? 0) || a.productId.localeCompare(b.productId)).map((row, index) => ({
      productId: row.productId.slice(0, 40),
      itemId: row.itemId?.slice(0, 40) ?? null,
      vendorItemId: row.vendorItemId?.slice(0, 40) ?? null,
      productName: row.productName ? row.productName.slice(0, 500) : null,
      categoryHierarchy: row.categoryHierarchy?.slice(0, 1e3) ?? null,
      salesRank: index + 1,
      salePrice: finite(row.salePrice),
      ratingCount: finite(row.ratingCount),
      pvLast28Day: finite(row.pvLast28Day),
      salesLast28d: finite(row.salesLast28d),
      estimatedRevenue28d: finite(row.estimatedRevenue28d),
      conversionRate28d: finite(row.conversionRate28d)
    }));
  }
  function finite(value) {
    return value !== null && Number.isFinite(value) ? value : null;
  }
  registerCollector(advertisingWingRankCollector);

  // extensions/src/collectors/advertising.wing_tracked_products/index.ts
  var advertisingWingTrackedProductsCollector = {
    kind: WING_TRACKED_PRODUCTS_KIND,
    site: "wing-search",
    async *collect(plan, site, { signal }) {
      const planned = new Set(plan.products.map((product) => product.productId));
      for (const [index, keyword2] of plan.keywords.entries()) {
        const read = await readWingSearchKeyword(site, keyword2, plan.maxPages, signal);
        if (read === null) return;
        const items = /* @__PURE__ */ new Map();
        for (const row of read.rows) {
          if (planned.has(row.productId) && !items.has(row.productId)) items.set(row.productId, trackedItem(row));
        }
        const chunk = { keyword: keyword2, items: [...items.values()] };
        yield {
          chunkKind: WING_TRACKED_PRODUCTS_CHUNK_KIND,
          payload: [chunk],
          progress: { current: index + 1, total: plan.keywords.length, label: keyword2 }
        };
      }
    }
  };
  function trackedItem(row) {
    return {
      productId: row.productId,
      salePriceKrw: boundedInteger(row.salePrice),
      ratingCount: boundedInteger(row.ratingCount),
      ratingAverage: boundedNumber(row.rating, 0, 5),
      pvLast28Day: boundedInteger(row.pvLast28Day),
      salesLast28d: boundedInteger(row.salesLast28d),
      estimatedRevenue28d: boundedNumber(row.estimatedRevenue28d, 0, 2147483647),
      conversionRate28d: boundedNumber(row.conversionRate28d, 0, 1)
    };
  }
  registerCollector(advertisingWingTrackedProductsCollector);

  // extensions/src/collectors/advertising.wing_traffic/index.ts
  var PAGE_SIZE = 100;
  var CHUNK_ITEMS2 = 1e3;
  var RUNTIME_PLAN_INVALID2 = "RUNTIME_PLAN_INVALID";
  var WING_TRAFFIC_PAGE_LIMIT_REACHED = "RUNTIME_PAGE_LIMIT_REACHED";
  var WING_TRAFFIC_DATA_NOT_READY = "WING_TRAFFIC_DATA_NOT_READY";
  var WING_TRAFFIC_PAGE_CONFLICT = "WING_TRAFFIC_PAGE_CONFLICT";
  var wingTrafficCollector = {
    kind: WING_TRAFFIC_KIND,
    site: "wing-traffic",
    async *collect(rawPlan, site, { signal, report }) {
      const parsed2 = WingTrafficPlanSchema.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID2, "\uD2B8\uB798\uD53D \uC218\uC9D1 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: WING_TRAFFIC_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID2, "Wing \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: WING_TRAFFIC_KIND });
      const plan = parsed2.data;
      if (signal.aborted) return;
      const vendorId2 = await site.readVendorId();
      if (vendorId2 !== plan.vendorId) {
        throw new RuntimeError(WING_VENDOR_IDENTITY_MISMATCH, "Wing\uC5D0 \uB2E4\uB978 \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uB3FC \uC788\uC2B5\uB2C8\uB2E4. \uC218\uC9D1\uD560 \uACC4\uC815\uC73C\uB85C \uB2E4\uC2DC \uB85C\uADF8\uC778\uD55C \uB4A4 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.", {
          plannedVendorId: plan.vendorId,
          observedVendorId: vendorId2
        });
      }
      const freshness = await site.readFreshness(/* @__PURE__ */ new Date());
      const confirmedEnd = [freshness.salesLatest, freshness.trafficLatest, plan.endDate].reduce((earliest, date) => date < earliest ? date : earliest);
      const dates = plan.expectedDates.filter((date) => date <= confirmedEnd);
      if (dates.length === 0) {
        throw new RuntimeError(
          WING_TRAFFIC_DATA_NOT_READY,
          `\uCFE0\uD321\uC774 ${plan.startDate} \uC774\uD6C4 \uD2B8\uB798\uD53D\uC744 \uC544\uC9C1 \uACF5\uAC1C\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uD2B8\uB798\uD53D ${freshness.trafficLatest} \xB7 \uB9E4\uCD9C ${freshness.salesLatest}\uAE4C\uC9C0 \uC9D1\uACC4\uB3FC \uC788\uC2B5\uB2C8\uB2E4.`,
          { latestTrafficDate: freshness.trafficLatest, latestSalesDate: freshness.salesLatest }
        );
      }
      if (plan.startDate < freshness.viewableStart || confirmedEnd > freshness.viewableEnd) {
        throw new RuntimeError(WING_TRAFFIC_DATA_NOT_READY, "\uCFE0\uD321 \uB9E4\uCD9C\uBD84\uC11D\uC774 \uC694\uCCAD\uD55C \uB0A0\uC9DC \uBC94\uC704\uB97C \uC81C\uACF5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", {
          viewableStart: freshness.viewableStart,
          viewableEnd: freshness.viewableEnd
        });
      }
      let rowTotal = 0;
      for (const [index, businessDate] of dates.entries()) {
        const progress4 = (current) => ({ current, confirmedDays: index, plannedDays: dates.length, rows: rowTotal });
        const buffer = new ChunkBuffer({ maxItems: CHUNK_ITEMS2, label: "\uD2B8\uB798\uD53D \uD589" });
        let totalResults = null;
        let totalPages = 1;
        let pages = 0;
        let rows = 0;
        for (let pageNumber = 0; pageNumber < totalPages; pageNumber += 1) {
          if (signal.aborted) return;
          if (pageNumber >= plan.maxPagesPerDay) {
            throw new RuntimeError(WING_TRAFFIC_PAGE_LIMIT_REACHED, `${businessDate} \uD2B8\uB798\uD53D\uC774 ${plan.maxPagesPerDay}\uCABD\uC744 \uB118\uC2B5\uB2C8\uB2E4.`, { businessDate });
          }
          const page = await site.readDetailPage({ businessDate, pageNumber, vendorId: plan.vendorId });
          if (page.pageNumber !== pageNumber || page.pageSize !== PAGE_SIZE || page.totalResults < 0) throw pageConflict(businessDate, pageNumber);
          if (totalResults === null) {
            totalResults = page.totalResults;
            totalPages = totalResults === 0 ? 1 : Math.ceil(totalResults / PAGE_SIZE);
            if (page.totalPages !== (totalResults === 0 ? 0 : totalPages)) throw pageConflict(businessDate, pageNumber);
            if (totalPages > plan.maxPagesPerDay) {
              throw new RuntimeError(WING_TRAFFIC_PAGE_LIMIT_REACHED, `${businessDate} \uD2B8\uB798\uD53D\uC774 ${plan.maxPagesPerDay}\uCABD\uC744 \uB118\uC2B5\uB2C8\uB2E4.`, { businessDate });
            }
          } else if (page.totalResults !== totalResults || page.totalPages !== totalPages) {
            throw pageConflict(businessDate, pageNumber);
          }
          const expectedRows = totalResults === 0 ? 0 : Math.min(PAGE_SIZE, totalResults - pageNumber * PAGE_SIZE);
          if (page.rows.length !== expectedRows) throw pageConflict(businessDate, pageNumber);
          pages += 1;
          for (const option of page.rows) {
            rows += 1;
            const full = buffer.push({ businessDate, ...option });
            if (full) yield rowsChunk2(full);
          }
          rowTotal += page.rows.length;
          await report?.({ ...progress4(businessDate) });
        }
        const rest = buffer.flush();
        if (rest) yield rowsChunk2(rest);
        if (signal.aborted) return;
        const accountSummary = await site.readSummary({ startDate: businessDate, endDate: businessDate });
        const day = { businessDate, pages, rows, explicitEmpty: rows === 0, capturedAt: (/* @__PURE__ */ new Date()).toISOString(), accountSummary };
        yield { chunkKind: WING_TRAFFIC_DAY_CHUNK_KIND, payload: [day], progress: { current: businessDate, confirmedDays: index + 1, plannedDays: dates.length, rows: rowTotal } };
      }
      if (signal.aborted) return;
      const periodSummary = await site.readSummary({ startDate: dates[0], endDate: dates[dates.length - 1] });
      const period = { startDate: dates[0], endDate: dates[dates.length - 1], capturedAt: (/* @__PURE__ */ new Date()).toISOString(), vendorId: vendorId2, accountSummary: periodSummary };
      yield { chunkKind: WING_TRAFFIC_PERIOD_CHUNK_KIND, payload: [period], progress: { current: null, confirmedDays: dates.length, plannedDays: dates.length, rows: rowTotal } };
    }
  };
  function rowsChunk2(payload) {
    return { chunkKind: WING_TRAFFIC_ROWS_CHUNK_KIND, payload };
  }
  function pageConflict(businessDate, pageNumber) {
    return new RuntimeError(WING_TRAFFIC_PAGE_CONFLICT, "Wing \uD2B8\uB798\uD53D \uCABD \uC815\uBCF4\uAC00 \uBC14\uB00C\uC5C8\uAC70\uB098 \uC77C\uBD80\uB9CC \uC654\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { businessDate, pageNumber });
  }
  registerCollector(wingTrafficCollector);

  // packages/shared/src/schemas/sellpia-operations.ts
  var SELLPIA_LOGIN_LOCK_KEY = resourceLockKey("sellpia", "login");
  var SELLPIA_OPERATION_CAPABILITY = "sellpiaOperationKindsV1";
  var SELLPIA_INVENTORY_KIND = "products.sellpia_inventory";
  var SELLPIA_SALES_KIND = "analytics.sellpia_sales";
  var SELLPIA_PRODUCT_PROFITABILITY_KIND = "analytics.sellpia_product_profitability";
  var SELLPIA_MANUAL_MATCH_KIND = "channels.sellpia_manual_match";
  var isoDay2 = external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
  var SellpiaInventoryScopeSchema = external_exports.object({
    trigger: external_exports.string().trim().min(1).max(64).optional()
  }).strict();
  var SellpiaSalesScopeSchema = external_exports.object({
    startDate: isoDay2.optional(),
    endDate: isoDay2.optional()
  }).strict().refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, "\uC2DC\uC791\uC77C\uC774 \uC885\uB8CC\uC77C\uBCF4\uB2E4 \uB2A6\uC2B5\uB2C8\uB2E4");
  var SellpiaProductProfitabilityScopeSchema = external_exports.object({
    normalizedSourceAvailabilityDate: isoDay2.optional()
  }).strict();
  var SellpiaManualMatchScopeSchema = external_exports.object({}).strict();
  var SELLPIA_INVENTORY_CHUNK_KIND = "inventory_rows";
  var SELLPIA_SALES_CHUNK_KIND = "sales_rows";
  var SELLPIA_PROFIT_CHUNK_KIND = "profit_months";
  var SELLPIA_MANUAL_MATCH_CHUNK_KIND = "match_results";
  var SELLPIA_INVENTORY_MAX_ROWS = 2e4;
  var SellpiaInventoryChunkHeaderSchema = external_exports.object({
    source: external_exports.literal("sellpia_product_search"),
    version: external_exports.literal(1),
    rowCount: external_exports.number().int().min(1).max(SELLPIA_INVENTORY_MAX_ROWS)
  }).strict();
  var SellpiaInventoryResultSchema = external_exports.object({
    rows: external_exports.number().int().nonnegative(),
    products: external_exports.number().int().nonnegative()
  }).strict();
  var SellpiaSalesRowSchema = external_exports.object({
    sellerId: external_exports.string().trim().min(1).max(64),
    sellerName: external_exports.string().trim().min(1).max(200),
    date: isoDay2,
    price: external_exports.number().finite(),
    amount: external_exports.number().finite(),
    buyPrice: external_exports.number().finite()
  }).strict();
  var SellpiaSalesResultSchema = external_exports.object({
    days: external_exports.number().int().nonnegative(),
    rows: external_exports.number().int().nonnegative()
  }).strict();
  var nonNegativeInt4 = external_exports.number().int().min(0).max(2147483647);
  var SellpiaProfitMonthSchema = external_exports.object({
    yearMonth: external_exports.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM"),
    orderQty: nonNegativeInt4,
    orderAmount: nonNegativeInt4,
    inQty: nonNegativeInt4,
    inAmount: nonNegativeInt4
  }).strict();
  var SellpiaProfitProductSchema = external_exports.object({
    productCode: external_exports.string().trim().min(1).max(64),
    optionCode: external_exports.string().max(64),
    productName: external_exports.string().trim().min(1).max(400),
    optionName: external_exports.string().max(400).optional(),
    providerName: external_exports.string().max(200).optional(),
    salePrice: nonNegativeInt4,
    buyPrice: nonNegativeInt4,
    barcode: external_exports.string().max(64).optional(),
    totalOrderAmount: nonNegativeInt4,
    totalOrderQty: nonNegativeInt4,
    totalInAmount: nonNegativeInt4,
    totalInQty: nonNegativeInt4,
    months: external_exports.array(SellpiaProfitMonthSchema).max(24)
  }).strict();
  var SellpiaProductProfitabilityResultSchema = external_exports.object({
    months: external_exports.number().int().nonnegative(),
    rows: external_exports.number().int().nonnegative(),
    quality: external_exports.object({
      mappedRows: external_exports.number().int().nonnegative(),
      unmappedRows: external_exports.number().int().nonnegative(),
      contentChecksum: external_exports.string().regex(/^[a-f0-9]{64}$/),
      contentByteCount: external_exports.number().int().positive()
    }).strict()
  }).strict();

  // extensions/src/core/site-caller.ts
  function delayUntilNext(input) {
    if (input.lastSentAt === null) return 0;
    return Math.max(0, input.lastSentAt + input.minIntervalMs - input.now);
  }
  var SITE_REQUEST_FAILED = "SITE_REQUEST_FAILED";
  var SITE_LOGIN_REQUIRED = "SITE_LOGIN_REQUIRED";
  var BODY_HEAD_LENGTH = 120;
  function bodyHeadOf(body) {
    const head = body.replace(/\s+/g, " ").trim().slice(0, BODY_HEAD_LENGTH);
    return head || null;
  }
  function createSiteCaller(options, deps) {
    let lastSentAt = null;
    let queue = Promise.resolve();
    const loginMessage = options.displayName ? `${options.displayName} \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.` : "\uC0AC\uC774\uD2B8 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
    async function send(url, { requireXsrf = false, ...init } = {}) {
      const headers = new Headers(init.headers);
      if (options.xsrf) {
        const cookie = await deps.cookies.get({ url: options.xsrf.cookieUrl, name: options.xsrf.cookieName });
        const token = decodeCookie(cookie?.value);
        if (token) headers.set(options.xsrf.headerName, token);
        else if (requireXsrf) throw new RuntimeError(SITE_LOGIN_REQUIRED, loginMessage, { url, reason: "xsrf_cookie_missing" });
      }
      const wait = delayUntilNext({ lastSentAt, now: deps.now(), minIntervalMs: options.minIntervalMs });
      if (wait > 0) await deps.sleep(wait);
      lastSentAt = deps.now();
      let response;
      const timeout = options.timeoutMs === void 0 ? null : AbortSignal.timeout(options.timeoutMs);
      const signal = timeout && init.signal ? AbortSignal.any([timeout, init.signal]) : timeout ?? init.signal;
      try {
        response = await deps.fetch(url, { credentials: "include", redirect: "manual", ...init, headers, ...signal ? { signal } : {} });
      } catch (error) {
        const timedOut = timeout?.aborted === true;
        const failure2 = { status: null, url, reason: timedOut ? "timeout" : "network", bodyHead: null };
        throw new RuntimeError(SITE_REQUEST_FAILED, timedOut ? "\uC0AC\uC774\uD2B8\uAC00 \uC81C\uB54C \uC751\uB2F5\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." : "\uC0AC\uC774\uD2B8\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", failure2, error);
      }
      if (response.status === 401 || response.status === 403 || response.type === "opaqueredirect") {
        throw new RuntimeError(SITE_LOGIN_REQUIRED, loginMessage, { status: response.status, url });
      }
      if (!response.ok) {
        const failure2 = { status: response.status, url, reason: "http", bodyHead: bodyHeadOf(await safeText(response)) };
        throw new RuntimeError(SITE_REQUEST_FAILED, `\uC0AC\uC774\uD2B8 \uC694\uCCAD\uC774 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4(${response.status}).`, failure2);
      }
      return response;
    }
    function enqueue(task) {
      const next = queue.then(task);
      queue = next.catch(() => void 0);
      return next;
    }
    return {
      json: (url, init) => enqueue(async () => {
        const response = await send(url, init);
        const body = await safeText(response);
        try {
          return JSON.parse(body);
        } catch (error) {
          const failure2 = { status: response.status, url, reason: "not_json", bodyHead: bodyHeadOf(body) };
          throw new RuntimeError(SITE_REQUEST_FAILED, "\uC0AC\uC774\uD2B8 \uC751\uB2F5\uC774 JSON\uC774 \uC544\uB2D9\uB2C8\uB2E4.", failure2, error);
        }
      }),
      text: (url, init) => enqueue(async () => (await send(url, init)).text()),
      bytes: (url, init) => enqueue(async () => new Uint8Array(await (await send(url, init)).arrayBuffer()))
    };
  }
  async function safeText(response) {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }
  function decodeCookie(value) {
    if (!value) return null;
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }

  // extensions/src/collectors/analytics.sellpia_product_profitability/index.ts
  var isoDay3 = external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  var PlanSchema = external_exports.object({
    from: isoDay3,
    to: isoDay3,
    coveredMonths: external_exports.array(external_exports.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).min(1)
  }).passthrough();
  var CHUNK_PRODUCTS = 500;
  var RUNTIME_PLAN_INVALID3 = "RUNTIME_PLAN_INVALID";
  var MISMATCH_MESSAGE = "\uC140\uD53C\uC544 \uC0C1\uD488\uBCC4 \uC774\uC775\uD604\uD669 \uAD6C\uB9E4\uAE30\uAC04 \uC751\uB2F5\uC774 401\uC77C \uD310\uB9E4 \uC99D\uAC70\uC640 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
  function purchasePeriods(plan) {
    return plan.coveredMonths.map((yearMonth) => {
      const [year, month] = yearMonth.split("-").map(Number);
      const monthStart = `${yearMonth}-01`;
      const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      return {
        yearMonth,
        from: monthStart > plan.from ? monthStart : plan.from,
        to: monthEnd < plan.to ? monthEnd : plan.to
      };
    });
  }
  function assembleProfitProducts(baseline, periods) {
    const identity2 = (product) => `${product.productCode}\0${product.optionCode}`;
    const periodCosts = /* @__PURE__ */ new Map();
    for (const period of periods) {
      if (period.rows.products.length !== baseline.products.length) throw mismatch();
      const byIdentity = new Map(period.rows.products.map((product) => [identity2(product), product]));
      for (const base of baseline.products) {
        const current = byIdentity.get(identity2(base));
        if (!current || current.totalOrderAmount !== base.totalOrderAmount || current.totalOrderQty !== base.totalOrderQty || current.months.length !== base.months.length) {
          throw mismatch();
        }
        const currentMonths = new Map(current.months.map((month) => [month.yearMonth, month]));
        for (const month of base.months) {
          const currentMonth = currentMonths.get(month.yearMonth);
          if (!currentMonth || currentMonth.orderAmount !== month.orderAmount || currentMonth.orderQty !== month.orderQty) throw mismatch();
        }
        const productPeriods = periodCosts.get(identity2(base)) ?? /* @__PURE__ */ new Map();
        if (productPeriods.has(period.yearMonth)) throw mismatch();
        productPeriods.set(period.yearMonth, { inAmount: current.totalInAmount, inQty: current.totalInQty });
        periodCosts.set(identity2(base), productPeriods);
      }
    }
    return baseline.products.map((base) => {
      const productPeriods = periodCosts.get(identity2(base)) ?? /* @__PURE__ */ new Map();
      const baseMonths = new Set(base.months.map((month) => month.yearMonth));
      let totalInAmount = 0;
      let totalInQty = 0;
      for (const period of periods) {
        const values = productPeriods.get(period.yearMonth);
        if (!values) throw mismatch();
        totalInAmount += values.inAmount;
        totalInQty += values.inQty;
        if (!baseMonths.has(period.yearMonth) && (values.inAmount !== 0 || values.inQty !== 0)) throw mismatch();
      }
      if (totalInAmount !== base.totalInAmount || totalInQty !== base.totalInQty) throw mismatch();
      const months = [...base.months].sort((left, right) => left.yearMonth.localeCompare(right.yearMonth)).map((month) => {
        const period = productPeriods.get(month.yearMonth);
        if (!period) throw mismatch();
        return { yearMonth: month.yearMonth, orderQty: month.orderQty, orderAmount: month.orderAmount, inQty: period.inQty, inAmount: period.inAmount };
      });
      return {
        productCode: base.productCode,
        optionCode: base.optionCode,
        productName: base.productName,
        ...base.optionName !== void 0 ? { optionName: base.optionName } : {},
        ...base.providerName !== void 0 ? { providerName: base.providerName } : {},
        salePrice: base.salePrice,
        buyPrice: base.buyPrice,
        ...base.barcode !== void 0 ? { barcode: base.barcode } : {},
        totalOrderAmount: base.totalOrderAmount,
        totalOrderQty: base.totalOrderQty,
        totalInAmount: base.totalInAmount,
        totalInQty: base.totalInQty,
        months
      };
    });
  }
  function mismatch() {
    return new RuntimeError(SITE_REQUEST_FAILED, MISMATCH_MESSAGE, { status: null, reason: "not_json", detail: "purchase_period_mismatch" });
  }
  var sellpiaProductProfitabilityCollector = {
    kind: SELLPIA_PRODUCT_PROFITABILITY_KIND,
    site: "sellpia",
    async *collect(rawPlan, site, { signal, report }) {
      const parsed2 = PlanSchema.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID3, "\uC140\uD53C\uC544 \uC0C1\uD488 \uC190\uC775 \uC218\uC9D1 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_PRODUCT_PROFITABILITY_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID3, "\uC140\uD53C\uC544 \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_PRODUCT_PROFITABILITY_KIND });
      const periods = purchasePeriods(parsed2.data);
      const read = await site.productProfit(
        { start: parsed2.data.from, end: parsed2.data.to, periods, signal },
        async (done, total) => {
          await report?.({ months: total, monthsRead: done });
        }
      );
      if (signal.aborted) return;
      const products = assembleProfitProducts(read.baseline, read.periods);
      const progress4 = { months: periods.length, monthsRead: periods.length, products: products.length, skippedAdjustments: read.baseline.skippedAdjustmentCount };
      const buffer = new ChunkBuffer({ maxItems: CHUNK_PRODUCTS, label: "\uC140\uD53C\uC544 \uC0C1\uD488 \uC190\uC775 \uD55C \uC0C1\uD488" });
      for (const product of products) {
        const full = buffer.push(product);
        if (full) yield { chunkKind: SELLPIA_PROFIT_CHUNK_KIND, payload: full, progress: progress4 };
      }
      const rest = buffer.flush();
      if (rest) yield { chunkKind: SELLPIA_PROFIT_CHUNK_KIND, payload: rest, progress: progress4 };
    }
  };
  registerCollector(sellpiaProductProfitabilityCollector);

  // extensions/src/collectors/analytics.sellpia_sales/index.ts
  var isoDay4 = external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  var PlanSchema2 = external_exports.object({
    range: external_exports.object({ from: isoDay4, to: isoDay4 })
  }).passthrough();
  var CHUNK_ROWS = 500;
  var RUNTIME_PLAN_INVALID4 = "RUNTIME_PLAN_INVALID";
  var sellpiaSalesCollector = {
    kind: SELLPIA_SALES_KIND,
    site: "sellpia",
    async *collect(rawPlan, site, { signal }) {
      const parsed2 = PlanSchema2.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID4, "\uC140\uD53C\uC544 \uB9E4\uCD9C \uC218\uC9D1 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_SALES_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID4, "\uC140\uD53C\uC544 \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_SALES_KIND });
      const { rows, sellers } = await site.sales({ startDate: parsed2.data.range.from, endDate: parsed2.data.range.to });
      if (signal.aborted) return;
      const progress4 = { rows: rows.length, sellers };
      const buffer = new ChunkBuffer({ maxItems: CHUNK_ROWS, label: "\uC140\uD53C\uC544 \uD310\uB9E4\uCC98\xB7\uC77C \uD55C \uC904" });
      for (const row of rows) {
        const full = buffer.push(row);
        if (full) yield { chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: full, progress: progress4 };
      }
      const rest = buffer.flush();
      if (rest) yield { chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: rest, progress: progress4 };
    }
  };
  registerCollector(sellpiaSalesCollector);

  // packages/shared/src/schemas/channels-operations.ts
  var SABANGNET_MALL_LISTINGS_KIND = "channels.sabangnet_mall_listings";
  var MALL_ADMIN_LISTINGS_KIND = "channels.mall_admin_listings";
  var SABANGNET_LOGIN_LOCK_KEY = resourceLockKey("sabangnet", "login");
  var SabangnetMallListingsScopeSchema = external_exports.object({}).strict();
  var MallAdminListingsScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    mallKey: external_exports.string().min(1).max(64)
  }).strict();
  var MALL_ADMIN_LISTING_OPERATION_MALLS = ["icecream-mall", "kidkids", "art09", "domeggook"];
  function isMallAdminListingOperationMall(mallKey) {
    return MALL_ADMIN_LISTING_OPERATION_MALLS.includes(mallKey);
  }
  var RocketMatchingCsvScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    fileName: external_exports.string().trim().min(1).max(240)
  }).strict();
  var SABANGNET_MALL_LISTINGS_CHUNK_KIND = "listing_rows";
  var MALL_ADMIN_LISTINGS_CHUNK_KIND = "listing_rows";
  var RocketMatchingCsvResultSchema = external_exports.object({
    rowCount: external_exports.number().int().nonnegative(),
    createdProductCount: external_exports.number().int().nonnegative(),
    updatedProductCount: external_exports.number().int().nonnegative(),
    createdSkuCount: external_exports.number().int().nonnegative(),
    updatedSkuCount: external_exports.number().int().nonnegative()
  }).strict();
  var SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND = "listing_scan";
  var MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND = "listing_scan";
  var CHANNELS_OPERATION_CAPABILITY = "channelsOperationKindsV1";

  // packages/shared/src/schemas/mall-admin-listings.ts
  var MALL_ADMIN_LISTINGS_SOURCE_TYPE = "mall_admin_listings";
  var MALL_ADMIN_LISTINGS_PARSER_VERSION = "mall-admin-listings-v1";
  var MALL_ADMIN_LISTING_ROW_LIMIT = 2e4;
  var MALL_ADMIN_LISTING_PAGE_LIMIT = 1e3;
  var MALL_ADMIN_LISTING_READERS = {
    kidkids: {
      mallName: "\uD0A4\uB4DC\uD0A4\uC988",
      origin: "https://partner.kidkids.net",
      pageSize: 2e4,
      detailNames: false
    },
    "icecream-mall": {
      mallName: "\uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0",
      origin: "https://po.i-screammall.co.kr",
      pageSize: 1e4,
      detailNames: true
    },
    /**
     * 온채널 공급사. 등록 상품 관리 화면이 쪽 크기를 고르지 못해 15줄씩 46쪽을 다 돈다
     * (라이브 2026-09-17: 687개). 쪽 경계가 상품코드로 갈려 겹치지 않는다.
     */
    onch: {
      mallName: "\uC628\uCC44\uB110",
      origin: "https://www.onch3.co.kr",
      pageSize: 15,
      detailNames: false
    },
    /**
     * 꼬망세(EduPre) 입점관리자. 배송상품 목록이 쪽 크기를 받아 줘 전체가 한 번에 들어온다
     * (라이브 2026-09-18: 2,602개).
     */
    kkomangse: {
      mallName: "\uAF2C\uB9DD\uC138",
      origin: "https://nstore.edupre.co.kr",
      pageSize: 1e4,
      detailNames: false
    },
    /**
     * 올웨이즈 판매자센터. 상품 조회/수정 화면이 부르는 목록 API(백엔드 alwayz-seller-back)를 화면 안에서 쪽마다
     * 읽는다 — 100개씩 1쪽부터(라이브 2026-09-19: 197개 = 100 + 97). 토큰은 화면 안에서만 쓴다.
     */
    always: {
      mallName: "\uC62C\uC6E8\uC774\uC988",
      origin: "https://alwayzseller.ilevit.com",
      pageSize: 100,
      detailNames: false
    },
    /**
     * 아트공구(카페24 공급사 관리자). 상품목록(ProductManage)을 100개씩 1쪽부터 끝까지 읽는다
     * (라이브 2026-09-19: 550개 = 6쪽, 겹침 없음). 몰 상품코드는 카페24 상품번호(product_no)다.
     */
    art09: {
      mallName: "\uC544\uD2B8\uACF5\uAD6C",
      origin: "https://zzogzzog1.cafe24.com",
      pageSize: 100,
      detailNames: false
    },
    /**
     * 떠리몰(샵바이 파트너 어드민). 상품정보 조회/수정 화면이 부르는 상품 검색 API(`admin-api.e-ncp.com`
     * `POST /products/search`)를 화면 안에서 100개씩 1쪽부터 읽는다(라이브 2026-09-19: 479개 = 5쪽). 몰 상품코드는
     * 샵바이 상품번호(mallProductNo)다. 토큰은 화면 쿠키에서 화면 안에서만 쓴다.
     */
    thirtymall: {
      mallName: "\uB5A0\uB9AC\uBAB0",
      origin: "https://partner.shopby.co.kr",
      pageSize: 100,
      detailNames: false
    },
    /*
      사방넷으로만 가져오던 몰(사장님 2026-09-19 "사방넷 이제 안쓸거야 … 상품 가져오기 버튼들 들어오면 바로 동기화").
      몰 상품코드는 사방넷이 쓰던 모양 그대로라 이미 이어진 리스팅 · 레시피를 그대로 쓴다. 이 몰들은 확장
      1.2.22(`mallAdminListingsMallsV2`)부터 읽고, 첫 라이브에서 고친 롯데ON(거래처로 좁히기 · 로그인 탭 빌리기) · 스마트스토어 ·
      티쳐몰은 1.2.23(`mallAdminListingsMallsV3`)부터 읽는다.
    */
    /** 도매꾹 상품공급사센터. 목록 조회를 500개씩(라이브 2026-09-19: 493개 = 1쪽). 몰 상품코드는 도매꾹 상품번호. */
    domeggook: {
      mallName: "\uB3C4\uB9E4\uAFB9",
      origin: "https://www.domeggook.com",
      pageSize: 500,
      detailNames: false,
      capability: "mallAdminListingsMallsV2"
    },
    /** 키즈노트(WISA). 판매 상품 내역을 100개씩(라이브 2026-09-19: 1,107개 = 12쪽). 몰 상품코드는 상품번호(pno). */
    kidsnote: {
      mallName: "\uD0A4\uC988\uB178\uD2B8",
      origin: "https://shop.kidsnote.com",
      pageSize: 100,
      detailNames: false,
      capability: "mallAdminListingsMallsV2"
    },
    /** 11번가 셀러오피스. 목록 조회를 100개씩 앞에서부터(라이브 2026-09-19: 900개). 전체 수를 따로 주지 않는다. */
    "11st": {
      mallName: "11\uBC88\uAC00",
      origin: "https://soffice.11st.co.kr",
      pageSize: 100,
      detailNames: false,
      capability: "mallAdminListingsMallsV2"
    },
    /**
     * 지마켓 · 옥션(ESM Plus). 마스터 상품 목록을 500개씩 읽고 그 사이트에 올라간 것만 고른다(라이브 2026-09-19: 마스터
     * 1,584 · 지마켓 934 · 옥션 754). 몰 상품코드는 사방넷 모양 `{사이트상품번호}_{마스터상품번호}`.
     */
    gmarket: {
      mallName: "\uC9C0\uB9C8\uCF13",
      origin: "https://item.esmplus.com",
      pageSize: 500,
      detailNames: false,
      capability: "mallAdminListingsMallsV2"
    },
    auction: {
      mallName: "\uC625\uC158",
      origin: "https://item.esmplus.com",
      pageSize: 500,
      detailNames: false,
      capability: "mallAdminListingsMallsV2"
    },
    /** 카카오 톡스토어 판매자센터. 목록 API 를 100개씩(라이브 2026-09-19: 386개 = 4쪽). 몰 상품코드는 상품번호(id). */
    kakao: {
      mallName: "\uCE74\uCE74\uC624 \uD1A1\uC2A4\uD1A0\uC5B4",
      origin: "https://shopping-seller.kakao.com",
      pageSize: 100,
      detailNames: false,
      capability: "mallAdminListingsMallsV2"
    },
    /** 롯데ON 판매자센터. 상품 조회를 100개씩(화면 안에서). 몰 상품코드는 판매자상품번호(`LO…`). */
    "lotte-on": {
      mallName: "\uB86F\uB370ON",
      origin: "https://store.lotteon.com",
      pageSize: 100,
      detailNames: false,
      capability: "mallAdminListingsMallsV3"
    },
    /** 스마트스토어센터. 원상품 목록 검색을 100개씩(화면 안에서). 몰 상품코드는 채널상품번호(원상품번호는 다른 코드). */
    smartstore: {
      mallName: "\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4",
      origin: "https://sell.smartstore.naver.com",
      pageSize: 100,
      detailNames: false,
      capability: "mallAdminListingsMallsV3"
    },
    /** 티쳐몰(퍼스트몰 selleradmin). 판매상품 목록을 100개씩. 몰 상품코드는 상품번호(goods_seq). */
    "teacher-mall": {
      mallName: "\uD2F0\uCCD0\uBAB0",
      origin: "https://shop.teacherville.co.kr",
      pageSize: 100,
      detailNames: false,
      capability: "mallAdminListingsMallsV3"
    }
  };
  var MALL_ADMIN_LISTING_MALL_KEYS = Object.keys(
    MALL_ADMIN_LISTING_READERS
  );
  var MallKeySchema = external_exports.enum(MALL_ADMIN_LISTING_MALL_KEYS);
  var YYYY_MM_DD = external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  var boundedText = (max) => external_exports.string().trim().max(max);
  var requiredText = (max) => boundedText(max).min(1);
  var MallAdminListingsBeginSchema = external_exports.object({
    mallKey: MallKeySchema
  }).strict();
  var MallAdminListingsPlanSchema = external_exports.object({
    sourceType: external_exports.literal(MALL_ADMIN_LISTINGS_SOURCE_TYPE),
    parserVersion: external_exports.literal(MALL_ADMIN_LISTINGS_PARSER_VERSION),
    mallKey: MallKeySchema,
    /** 몰 허브가 고르는 그 몰의 계정 행. 완료할 때 같은 행인지 다시 본다. */
    channelAccountId: external_exports.string().uuid(),
    sourceOrigin: external_exports.string().url(),
    pageSize: external_exports.number().int().positive().max(2e4)
  }).strict().superRefine((plan, ctx) => {
    const reader = MALL_ADMIN_LISTING_READERS[plan.mallKey];
    if (plan.sourceOrigin !== reader.origin) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["sourceOrigin"], message: "Unknown mall origin" });
    }
    if (plan.pageSize !== reader.pageSize) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["pageSize"], message: "Unexpected page size" });
    }
  });
  var MallAdminListingsAttemptSchema = external_exports.object({
    attemptId: external_exports.string().uuid(),
    state: external_exports.enum(["RUNNING", "COMPLETE", "FAILED"]),
    generation: external_exports.string().regex(/^\d+$/),
    plan: MallAdminListingsPlanSchema,
    expiresAt: external_exports.string().datetime(),
    completedAt: external_exports.string().datetime().nullable(),
    errorCode: boundedText(100).nullable(),
    errorMessage: boundedText(300).nullable()
  }).strict();
  var MallAdminListingsControlSchema = MallAdminListingsAttemptSchema.extend({
    attemptToken: external_exports.string().uuid()
  }).strict();
  var MallAdminListingsPublicationSchema = external_exports.object({
    /** 이번에 받은 몰 상품코드 수. */
    listings: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
    /** 전에 받았는데 이번 목록에 없어 끈 리스팅 수. */
    deactivated: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
    /** 셀피아 쪽 이름을 읽지 못한 상품 수. 그 상품은 상품명으로만 잇는다. */
    missingNames: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
    /**
     * 몰에 셀피아 코드가 심겨 있어 코드로 정확히 이을 수 있는 상품 수.
     *
     * 이 칸이 생기기 전에 저장된 발행 결과에도 기본값으로 붙는다 — 새 칸 하나 때문에 옛
     * 결과를 통째로 못 읽으면 화면이 "0개 가져옴"이라고 거짓말을 한다.
     */
    codedListings: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT).default(0),
    /** 우리 상태 글자별 상품 수. */
    statuses: external_exports.record(requiredText(20), external_exports.number().int().min(1).max(MALL_ADMIN_LISTING_ROW_LIMIT)).refine((value) => Object.keys(value).length <= 20, "Too many statuses")
  }).strict();
  var MallAdminListingsSourceMallSchema = external_exports.object({
    mallKey: MallKeySchema,
    mallName: requiredText(40),
    /** 그 몰의 계정 행. 없으면 가져올 곳이 없다. */
    channelAccountId: external_exports.string().uuid().nullable(),
    latestAttempt: MallAdminListingsAttemptSchema.nullable(),
    latestComplete: MallAdminListingsAttemptSchema.nullable(),
    /**
     * `latestComplete`(실행 kind로 옮긴 몰은 `latestSucceeded`)가 남긴 결과.
     */
    latestPublication: MallAdminListingsPublicationSchema.nullable(),
    /**
     * 실행 kind(`channels.mall_admin_listings`, KID-363)로 옮긴 몰(`MALL_ADMIN_LISTING_OPERATION_MALLS`)의 최근 실행과 최근
     * 성공 실행. 옮긴 몰은 옛 시도(`latestAttempt`·`latestComplete`)를 읽지 않아 그 둘이 null이고, 나머지 몰은 이 둘이 null이다.
     */
    latestOperation: OperationViewSchema.nullable(),
    latestSucceeded: OperationViewSchema.nullable()
  }).strict();
  var MallAdminListingsSourceSchema = external_exports.object({
    malls: external_exports.array(MallAdminListingsSourceMallSchema)
  }).strict();
  var MallAdminListingRowSchema = external_exports.object({
    /** 몰 상품코드. 옵션 외부 ID 칸이 60자다. */
    mallProductCode: requiredText(60),
    /**
     * 같은 상품을 다른 번호로 가져온 적이 있을 때 그 번호(사방넷이 ESM 사이트번호만 · 스마트스토어 원상품번호로 준 것).
     * 그 번호로 이미 이어진 리스팅이 있으면 서버가 그 번호를 쓴다 — 레시피가 그 리스팅에 붙어 있다.
     */
    alternateCodes: external_exports.array(requiredText(60)).max(3).optional(),
    productName: requiredText(400),
    /** 몰에 적어 둔 셀피아 상품 이름 — 키드키즈 송장용 상품명, 아이스크림몰 고시 품명. */
    sellpiaName: requiredText(400).nullable(),
    /**
     * 몰의 자체상품코드 칸에 우리가 심어 둔 셀피아 SKU 코드(키드키즈 `P 코드`, 아이스크림몰
     * `업체상품코드`). 사방넷이 `모델명`에 셀피아 코드를 넣어 보낸 것과 같은 자리다 — 이 값이
     * 있으면 이름이 아니라 코드로 정확히 잇는다. 아직 안 심은 상품은 비어 있다.
     */
    sellerCode: requiredText(60).nullable(),
    salePrice: external_exports.number().int().nonnegative().max(1e9).nullable(),
    statusWords: external_exports.array(requiredText(20)).min(1).max(4),
    registeredOn: YYYY_MM_DD.nullable(),
    /** 몰이 들고 있는 대표 사진. 목록에 사진이 있는 몰만 싣는다. */
    imageUrl: external_exports.string().url().max(2e3).optional()
  }).strict();
  var MallAdminListingsCollectionSchema = external_exports.object({
    collectionRunId: external_exports.string().uuid(),
    /** 몰이 알린 전체 상품 수. */
    totalRecords: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
    /** 실제로 읽은 상품 줄 수. */
    recordsRead: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
    pagesRead: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_PAGE_LIMIT),
    totalPages: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_PAGE_LIMIT),
    /** 셀피아 쪽 이름을 읽으려고 연 상세 화면 가운데 읽은 수와 읽지 못한 수. */
    detailsRead: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
    detailsMissing: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT)
  }).strict();
  var MallAdminListingsSubmissionSchema = external_exports.object({
    collection: MallAdminListingsCollectionSchema,
    rows: external_exports.array(MallAdminListingRowSchema).max(MALL_ADMIN_LISTING_ROW_LIMIT),
    proof: external_exports.object({
      mallKey: MallKeySchema,
      pageSize: external_exports.number().int().positive().max(2e4),
      validatedList: external_exports.literal(true)
    }).strict()
  }).strict();
  var MallAdminListingsScanSchema = external_exports.object({
    collection: MallAdminListingsCollectionSchema.omit({ collectionRunId: true }),
    proof: MallAdminListingsSubmissionSchema.shape.proof
  }).strict();
  var MallAdminListingsResultSchema = MallAdminListingsPublicationSchema.extend({
    rows: external_exports.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT)
  }).strict();

  // extensions/src/collectors/channels.mall_admin_listings/index.ts
  var RUNTIME_PLAN_INVALID5 = "RUNTIME_PLAN_INVALID";
  var SOURCE_SNAPSHOT_INVALID = "SOURCE_SNAPSHOT_INVALID";
  var CHUNK_ROWS2 = 1e3;
  var mallAdminListingsCollector = {
    kind: MALL_ADMIN_LISTINGS_KIND,
    site: "mall-admin-listings",
    async *collect(rawPlan, site, { signal }) {
      const parsed2 = MallAdminListingsPlanSchema.safeParse(rawPlan);
      const reader = parsed2.success && site ? site.reader(parsed2.data.mallKey) : null;
      if (!parsed2.success || !reader?.readListings) {
        throw new RuntimeError(RUNTIME_PLAN_INVALID5, "\uC774 \uD655\uC7A5\uC774 \uAC00\uC838\uC62C \uC218 \uC5C6\uB294 \uBAB0 \uC0C1\uD488 \uBAA9\uB85D \uACC4\uD68D\uC785\uB2C8\uB2E4.", {
          kind: MALL_ADMIN_LISTINGS_KIND,
          mallKey: parsed2.success ? parsed2.data.mallKey : null
        });
      }
      const plan = parsed2.data;
      const snapshot = await reader.readListings(plan);
      if (signal.aborted) return;
      const scan = MallAdminListingsScanSchema.safeParse({ collection: snapshot.collection, proof: snapshot.proof });
      if (!scan.success) {
        throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, "\uBAB0 \uC0C1\uD488 \uBAA9\uB85D\uC758 \uC77D\uC740 \uC99D\uAC70\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { mallKey: plan.mallKey, stage: "scan" });
      }
      const progress4 = { mallKey: plan.mallKey, rows: snapshot.rows.length };
      const buffer = new ChunkBuffer({ maxItems: CHUNK_ROWS2, label: "\uBAB0 \uC0C1\uD488 \uD55C \uC904" });
      for (const [index, row] of snapshot.rows.entries()) {
        const checked = MallAdminListingRowSchema.safeParse(row);
        if (!checked.success) {
          throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, "\uBAB0 \uC0C1\uD488 \uBAA9\uB85D\uC5D0 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uC904\uC774 \uC788\uC2B5\uB2C8\uB2E4.", { mallKey: plan.mallKey, stage: "row", index });
        }
        const full = buffer.push(checked.data);
        if (full) yield { chunkKind: MALL_ADMIN_LISTINGS_CHUNK_KIND, payload: full, progress: progress4 };
      }
      const rest = buffer.flush();
      if (rest) yield { chunkKind: MALL_ADMIN_LISTINGS_CHUNK_KIND, payload: rest, progress: progress4 };
      yield { chunkKind: MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND, payload: [scan.data], progress: progress4 };
    }
  };
  registerCollector(mallAdminListingsCollector);

  // packages/shared/src/schemas/sabangnet-mall-listings.ts
  var SABANGNET_ADMIN_ORIGIN = "https://sbadmin08.sabangnet.co.kr";
  var SABANGNET_MALL_LISTING_LIST_PATH = "/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists";
  var SABANGNET_MALL_LISTINGS_SOURCE_TYPE = "sabangnet_mall_listings";
  var SABANGNET_MALL_LISTINGS_PARSER_VERSION = "sabangnet-mall-listings-v1";
  var SABANGNET_MALL_LISTING_PAGE_SIZE = 500;
  var SABANGNET_MALL_LISTING_ROW_LIMIT = 2e4;
  var SABANGNET_MALL_LISTING_PAGE_LIMIT = 100;
  var SHOP_ID = external_exports.string().regex(/^shop\d{4}$/);
  var YYYYMMDD = external_exports.string().regex(/^\d{8}$/);
  var boundedText2 = (max) => external_exports.string().trim().max(max);
  var requiredText2 = (max) => boundedText2(max).min(1);
  var SabangnetMallListingsPlanMallSchema = external_exports.object({
    mallKey: requiredText2(40),
    channelAccountId: external_exports.string().uuid(),
    sabangnetShopIds: external_exports.array(SHOP_ID).min(1).max(10)
  }).strict();
  var SabangnetMallListingsPlanSchema = external_exports.object({
    sourceType: external_exports.literal(SABANGNET_MALL_LISTINGS_SOURCE_TYPE),
    parserVersion: external_exports.literal(SABANGNET_MALL_LISTINGS_PARSER_VERSION),
    sourceOrigin: external_exports.literal(SABANGNET_ADMIN_ORIGIN),
    listPath: external_exports.literal(SABANGNET_MALL_LISTING_LIST_PATH),
    pageSize: external_exports.literal(SABANGNET_MALL_LISTING_PAGE_SIZE),
    /** 사방넷 첫 송신일 검색 범위. 끝은 시작한 날(KST)이다. */
    dateFrom: YYYYMMDD,
    dateTo: YYYYMMDD,
    malls: external_exports.array(SabangnetMallListingsPlanMallSchema).min(1).max(40)
  }).strict().superRefine((plan, ctx) => {
    if (plan.dateFrom > plan.dateTo) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["dateFrom"], message: "Invalid date range" });
    }
    const shopIds = plan.malls.flatMap((mall) => mall.sabangnetShopIds);
    if (new Set(shopIds).size !== shopIds.length) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["malls"], message: "Shop ids must be unique" });
    }
    const accounts = plan.malls.map((mall) => mall.channelAccountId);
    if (new Set(accounts).size !== accounts.length) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["malls"], message: "Accounts must be unique" });
    }
  });
  var SabangnetMallListingsPublicationSchema = external_exports.object({
    mallKey: requiredText2(40),
    channelAccountId: external_exports.string().uuid(),
    /** 이번에 받은 몰 상품코드 수. */
    listings: external_exports.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
    /** 전에 받았는데 이번 목록에 없어 끈 리스팅 수. */
    deactivated: external_exports.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT)
  }).strict();
  var SabangnetMallListingsSourceMallSchema = external_exports.object({
    mallKey: requiredText2(40),
    /** 그 몰의 계정 행. 없으면 가져올 곳이 없다. */
    channelAccountId: external_exports.string().uuid().nullable(),
    sabangnetShopIds: external_exports.array(SHOP_ID).min(1).max(10)
  }).strict();
  var SabangnetMallListingsResultSchema = external_exports.object({
    malls: external_exports.array(SabangnetMallListingsPublicationSchema),
    rows: external_exports.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT)
  }).strict();
  var SabangnetMallListingsSourceSchema = external_exports.object({
    /** 받을 몰 계정 행이 하나라도 있는가. */
    ready: external_exports.boolean(),
    malls: external_exports.array(SabangnetMallListingsSourceMallSchema),
    latestOperation: OperationViewSchema.nullable(),
    latestSucceeded: OperationViewSchema.nullable(),
    /** `latestSucceeded` 가 몰마다 남긴 결과. */
    latestPublication: external_exports.array(SabangnetMallListingsPublicationSchema)
  }).strict();
  var SabangnetMallListingRowSchema = external_exports.object({
    /** 사방넷 송신번호(`prdRegsTrnmSrno`). 같은 기록이 두 번 오면 거절한다. */
    sendSerial: external_exports.string().regex(/^\d{1,30}$/),
    sabangnetShopId: SHOP_ID,
    /** 몰 상품코드(`shmaPrdNo`). 옵션 외부 ID 칸이 60자다. */
    mallProductCode: requiredText2(60),
    /** 사방넷 품번(`prdNo`). */
    sabangnetProductNo: external_exports.string().regex(/^\d{1,30}$/),
    /** 사방넷 모델명(`modlNm`). 셀피아 재고 SKU 코드와 같다. */
    modelName: requiredText2(120).nullable(),
    /** 사방넷 자체상품코드(`onsfPrdCd`). 바코드인 경우가 많다. */
    ownProductCode: requiredText2(120).nullable(),
    productName: requiredText2(400),
    salePrice: external_exports.number().int().nonnegative().max(1e9).nullable(),
    /** 사방넷 공급상태 이름(`prdSplyStsCdNm`) — 공급중 · 일시중지 · 완전품절 · 대기중. */
    supplyStatus: requiredText2(20),
    /** 첫 송신 시각(`prdRegsFstTrnmDt`, `yyyyMMdd HH:mm`). */
    firstSentAt: external_exports.string().regex(/^\d{8} \d{2}:\d{2}$/).nullable()
  }).strict();
  var SabangnetMallListingsCollectionSchema = external_exports.object({
    /** 사방넷이 알린 전체 송신 기록 수(모든 몰). */
    totalRecords: external_exports.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
    /** 실제로 읽은 송신 기록 수(실패 메시지 줄 제외, 모든 몰). */
    recordsRead: external_exports.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
    pagesRead: external_exports.number().int().min(0).max(SABANGNET_MALL_LISTING_PAGE_LIMIT),
    totalPages: external_exports.number().int().min(0).max(SABANGNET_MALL_LISTING_PAGE_LIMIT),
    truncated: external_exports.boolean(),
    /** 계획에 없는 쇼핑몰의 기록 수. 넘기지 않고 세기만 한다. */
    skippedByShop: external_exports.record(SHOP_ID, external_exports.number().int().min(1).max(SABANGNET_MALL_LISTING_ROW_LIMIT)).refine((value) => Object.keys(value).length <= 200, "Too many skipped shops"),
    /** 몰 상품코드가 비어 넘기지 못한 기록 수. */
    missingMallCode: external_exports.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT)
  }).strict();
  var SabangnetMallListingsScanSchema = external_exports.object({
    collection: SabangnetMallListingsCollectionSchema,
    proof: external_exports.object({
      dateFrom: YYYYMMDD,
      dateTo: YYYYMMDD,
      pageSize: external_exports.literal(SABANGNET_MALL_LISTING_PAGE_SIZE),
      validatedList: external_exports.literal(true)
    }).strict()
  }).strict();

  // extensions/src/collectors/channels.sabangnet_mall_listings/index.ts
  var RUNTIME_PLAN_INVALID6 = "RUNTIME_PLAN_INVALID";
  var MALL_CONTRACT_CHANGED = "MALL_CONTRACT_CHANGED";
  var SOURCE_SNAPSHOT_INVALID2 = "SOURCE_SNAPSHOT_INVALID";
  var CHUNK_ROWS3 = 500;
  function drift(stage) {
    throw new RuntimeError(MALL_CONTRACT_CHANGED, `\uC0AC\uBC29\uB137 \uBAA9\uB85D \uD615\uC2DD\uC774 \uBC14\uB00C\uC5B4 \uAC00\uC838\uC624\uAE30\uB97C \uBA48\uCDC4\uC2B5\uB2C8\uB2E4. [${stage}]`, { stage });
  }
  function text(value, maximum) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).replace(/\s+/g, " ").trim();
    return normalized && normalized.length <= maximum ? normalized : null;
  }
  function digits(value, maximum) {
    const normalized = text(value, maximum);
    return normalized && /^\d+$/.test(normalized) ? normalized : null;
  }
  function price(value) {
    if (value === null || value === void 0 || value === "") return null;
    const parsed2 = Number(value);
    return Number.isSafeInteger(parsed2) && parsed2 >= 0 && parsed2 <= 1e9 ? parsed2 : null;
  }
  function sentAt(value) {
    const normalized = text(value, 20);
    return normalized && /^\d{8} \d{2}:\d{2}$/.test(normalized) ? normalized : null;
  }
  var sabangnetMallListingsCollector = {
    kind: SABANGNET_MALL_LISTINGS_KIND,
    site: "sabangnet",
    async *collect(rawPlan, site, { signal, report }) {
      const parsed2 = SabangnetMallListingsPlanSchema.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID6, "\uC0AC\uBC29\uB137 \uAC00\uC838\uC624\uAE30 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: SABANGNET_MALL_LISTINGS_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID6, "\uC0AC\uBC29\uB137 \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: SABANGNET_MALL_LISTINGS_KIND });
      const plan = parsed2.data;
      const planned = new Set(plan.malls.flatMap((mall) => mall.sabangnetShopIds));
      const query = { listPath: plan.listPath, dateFrom: plan.dateFrom, dateTo: plan.dateTo, pageSize: plan.pageSize };
      const buffer = new ChunkBuffer({ maxItems: CHUNK_ROWS3, label: "\uC0AC\uBC29\uB137 \uC1A1\uC2E0 \uAE30\uB85D \uD55C \uC904" });
      const seen = /* @__PURE__ */ new Set();
      const skippedByShop = {};
      let missingMallCode = 0;
      let recordsRead = 0;
      let rows = 0;
      let pagesRead = 0;
      let totalRecords = null;
      let totalPages = 1;
      try {
        for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
          if (signal.aborted) return;
          const page = await site.mallListingPage(query, currentPage);
          if (totalRecords === null) {
            totalRecords = page.total;
            if (totalRecords > SABANGNET_MALL_LISTING_ROW_LIMIT) {
              throw new RuntimeError(SOURCE_SNAPSHOT_INVALID2, "\uC0AC\uBC29\uB137 \uC1A1\uC2E0 \uAE30\uB85D\uC774 \uD55C \uBC88\uC5D0 \uAC00\uC838\uC62C \uC218 \uC788\uB294 \uC218\uB97C \uB118\uC2B5\uB2C8\uB2E4.", { stage: "row_limit", totalRecords });
            }
            totalPages = Math.max(1, Math.ceil(totalRecords / plan.pageSize));
            if (totalPages > SABANGNET_MALL_LISTING_PAGE_LIMIT) {
              throw new RuntimeError(SOURCE_SNAPSHOT_INVALID2, "\uC0AC\uBC29\uB137 \uC1A1\uC2E0 \uAE30\uB85D \uCABD \uC218\uAC00 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4.", { stage: "page_limit", totalPages });
            }
          } else if (page.total !== totalRecords) {
            throw new RuntimeError(SOURCE_SNAPSHOT_INVALID2, "\uC77D\uB294 \uC0AC\uC774 \uC0AC\uBC29\uB137 \uC1A1\uC2E0 \uAE30\uB85D\uC774 \uB298\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uAC00\uC838\uC640 \uC8FC\uC138\uC694.", { stage: "total_changed" });
          }
          pagesRead += 1;
          for (const item of page.items) {
            const shopId = text(item.shmaId, 20);
            if (!shopId || !/^shop\d{4}$/.test(shopId)) drift("shop");
            const sendSerial = digits(item.prdRegsTrnmSrno, 30);
            if (!sendSerial) drift("send_serial");
            if (seen.has(sendSerial)) continue;
            seen.add(sendSerial);
            recordsRead += 1;
            if (!planned.has(shopId)) {
              skippedByShop[shopId] = (skippedByShop[shopId] ?? 0) + 1;
              continue;
            }
            const mallProductCode = text(item.shmaPrdNo, 60);
            if (!mallProductCode) {
              missingMallCode += 1;
              continue;
            }
            const sabangnetProductNo = digits(item.prdNo, 30);
            const productName = text(item.prdNm, 400);
            const supplyStatus = text(item.prdSplyStsCdNm, 20);
            if (!sabangnetProductNo) drift("product_no");
            if (!productName) drift("product_name");
            if (!supplyStatus) drift("supply_status");
            rows += 1;
            const full = buffer.push({
              sendSerial,
              sabangnetShopId: shopId,
              mallProductCode,
              sabangnetProductNo,
              modelName: text(item.modlNm, 120),
              ownProductCode: text(item.onsfPrdCd, 120),
              productName,
              salePrice: price(item.sepr),
              supplyStatus,
              firstSentAt: sentAt(item.prdRegsFstTrnmDt)
            });
            if (full) yield { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, payload: full, progress: { pagesRead, totalPages, rows } };
          }
          const expected = currentPage < totalPages ? plan.pageSize : totalRecords - plan.pageSize * (totalPages - 1);
          if (page.items.length !== expected) drift("page_size");
          await report?.({ pagesRead, totalPages, rows });
        }
        const rest = buffer.flush();
        if (rest) yield { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, payload: rest, progress: { pagesRead, totalPages, rows } };
        const scan = {
          collection: {
            totalRecords: totalRecords ?? 0,
            recordsRead,
            pagesRead,
            totalPages,
            truncated: false,
            skippedByShop,
            missingMallCode
          },
          proof: { dateFrom: plan.dateFrom, dateTo: plan.dateTo, pageSize: plan.pageSize, validatedList: true }
        };
        yield { chunkKind: SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND, payload: [scan], progress: { pagesRead, totalPages, rows } };
      } finally {
        await site.close();
      }
    }
  };
  registerCollector(sabangnetMallListingsCollector);

  // packages/shared/src/schemas/sellpia-manual-match.ts
  var SELLPIA_MANUAL_MATCH_SOURCE_TYPE = "sellpia_product_manual_match";
  var SELLPIA_MANUAL_MATCH_PARSER_VERSION = "sellpia-manual-match-v1";
  var SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN = "https://kiditem.sellpia.com";
  var SELLPIA_MANUAL_MATCH_SOURCE_PATH = "/product_manual_match.html";
  var MAX_SELLPIA_MANUAL_MATCH_TARGETS = 2e4;
  var MAX_SELLPIA_MANUAL_MATCH_ROWS = 1e5;
  var POSTGRES_INTEGER_MAX = 2147483647;
  var SellpiaManualMatchCodeSchema = external_exports.string().trim().min(1).max(100).regex(/^\d+(?:-\d+)*$/);
  var SellpiaManualMatchRowSchema = external_exports.object({
    productCode: SellpiaManualMatchCodeSchema,
    aliasTitle: external_exports.string().trim().min(1).max(500),
    itemCount: external_exports.number().int().min(1).max(POSTGRES_INTEGER_MAX),
    matchedType: external_exports.enum(["M", "P", "E"]),
    evidenceCount: external_exports.number().int().min(1).max(MAX_SELLPIA_MANUAL_MATCH_ROWS)
  }).strict();
  var SellpiaManualMatchSnapshotStatusSchema = external_exports.object({
    targetCount: external_exports.number().int().nonnegative(),
    matchedTargetCount: external_exports.number().int().nonnegative(),
    aliasCount: external_exports.number().int().nonnegative(),
    snapshotHash: external_exports.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: zIsoDate
  }).strict();
  var SellpiaManualMatchPlanSchema = external_exports.object({
    sourceType: external_exports.literal(SELLPIA_MANUAL_MATCH_SOURCE_TYPE),
    parserVersion: external_exports.literal(SELLPIA_MANUAL_MATCH_PARSER_VERSION),
    sourceOrigin: external_exports.literal(SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN),
    sourcePath: external_exports.literal(SELLPIA_MANUAL_MATCH_SOURCE_PATH),
    targetCount: external_exports.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
    targetCodes: external_exports.array(SellpiaManualMatchCodeSchema).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS)
  }).strict().superRefine((plan, ctx) => {
    if (plan.targetCount !== plan.targetCodes.length) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["targetCount"],
        message: "targetCount must equal targetCodes length"
      });
    }
    plan.targetCodes.forEach((code, index) => {
      const previous = plan.targetCodes[index - 1];
      if (previous !== void 0 && code <= previous) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["targetCodes", index],
          message: code === previous ? "targetCodes must be unique" : "targetCodes must be sorted"
        });
      }
    });
  });
  var SellpiaManualMatchSourceStatusSchema = external_exports.object({
    latestOperation: OperationViewSchema.nullable(),
    currentSnapshot: SellpiaManualMatchSnapshotStatusSchema.nullable()
  }).strict();
  var SellpiaManualMatchResultSchema = external_exports.object({
    targets: external_exports.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
    matched: external_exports.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS)
  }).strict();

  // extensions/src/collectors/channels.sellpia_manual_match/index.ts
  var RUNTIME_PLAN_INVALID7 = "RUNTIME_PLAN_INVALID";
  var MALL_CONTRACT_CHANGED2 = "MALL_CONTRACT_CHANGED";
  var SOURCE_SNAPSHOT_INVALID3 = "SOURCE_SNAPSHOT_INVALID";
  var SEARCH_BATCH = 100;
  var STATUS_BATCH = 100;
  var CHUNK_ROWS4 = 2e3;
  function identity(row) {
    return [row.productCode, row.aliasTitle, String(row.itemCount).padStart(10, "0"), row.matchedType].join("\0");
  }
  var sellpiaManualMatchCollector = {
    kind: SELLPIA_MANUAL_MATCH_KIND,
    site: "sellpia",
    async *collect(rawPlan, site, { signal, report }) {
      const parsed2 = SellpiaManualMatchPlanSchema.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID7, "\uC140\uD53C\uC544 \uC218\uB3D9\uB9E4\uCE6D \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_MANUAL_MATCH_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID7, "\uC140\uD53C\uC544 \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_MANUAL_MATCH_KIND });
      const { targetCodes } = parsed2.data;
      try {
        const byMd5 = /* @__PURE__ */ new Map();
        const received = [];
        let candidates = 0;
        for (let offset = 0; offset < targetCodes.length; offset += SEARCH_BATCH) {
          if (signal.aborted) return;
          const found = await site.manualMatchSearch(targetCodes.slice(offset, offset + SEARCH_BATCH));
          for (const candidate of found) {
            const group = byMd5.get(candidate.matchMd5) ?? [];
            const existing = group.find((value) => value.productCode === candidate.productCode && value.aliasTitle === candidate.aliasTitle);
            if (existing && existing.itemCount !== candidate.itemCount) {
              throw new RuntimeError(MALL_CONTRACT_CHANGED2, "\uC140\uD53C\uC544 \uC218\uB3D9\uC0C1\uD488\uB9E4\uCE6D \uC218\uB7C9\uC774 \uC11C\uB85C \uB2E4\uB985\uB2C8\uB2E4.", { stage: `search-quantity-conflict:${candidate.productCode}` });
            }
            candidates += 1;
            received.push(candidate);
            if (!existing) group.push(candidate);
            byMd5.set(candidate.matchMd5, group);
          }
          if (candidates > MAX_SELLPIA_MANUAL_MATCH_ROWS) {
            throw new RuntimeError(SOURCE_SNAPSHOT_INVALID3, "\uC140\uD53C\uC544 \uC218\uB3D9\uC0C1\uD488\uB9E4\uCE6D \uADFC\uAC70\uAC00 \uD55C \uBC88\uC5D0 \uBC1B\uC744 \uC218 \uC788\uB294 \uC218\uB97C \uB118\uC2B5\uB2C8\uB2E4.", { candidates });
          }
          await report?.({ searched: Math.min(offset + SEARCH_BATCH, targetCodes.length), targets: targetCodes.length, candidates });
        }
        const md5s = [...byMd5.keys()].sort();
        const typeByMd5 = /* @__PURE__ */ new Map();
        for (let offset = 0; offset < md5s.length; offset += STATUS_BATCH) {
          if (signal.aborted) return;
          const batch = md5s.slice(offset, offset + STATUS_BATCH);
          const types = await site.manualMatchStatus(batch);
          for (const matchMd5 of batch) {
            const matchedType = types[matchMd5];
            if (matchedType !== "M" && matchedType !== "P" && matchedType !== "E") {
              throw new RuntimeError(MALL_CONTRACT_CHANGED2, "\uC140\uD53C\uC544 \uC218\uB3D9\uC0C1\uD488\uB9E4\uCE6D \uC0C1\uD0DC \uC751\uB2F5\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { stage: `status-target:${matchMd5.slice(0, 12)}` });
            }
            typeByMd5.set(matchMd5, matchedType);
          }
        }
        const aggregated = /* @__PURE__ */ new Map();
        for (const candidate of received) {
          const matchedType = typeByMd5.get(candidate.matchMd5);
          const key = identity({ ...candidate, matchedType });
          const previous = aggregated.get(key);
          aggregated.set(key, previous ? { ...previous, evidenceCount: previous.evidenceCount + 1 } : { productCode: candidate.productCode, aliasTitle: candidate.aliasTitle, itemCount: candidate.itemCount, matchedType, evidenceCount: 1 });
        }
        const rows = [...aggregated.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, row]) => row);
        const progress4 = { searched: targetCodes.length, targets: targetCodes.length, candidates, rows: rows.length };
        const buffer = new ChunkBuffer({ maxItems: CHUNK_ROWS4, label: "\uC140\uD53C\uC544 \uC218\uB3D9\uB9E4\uCE6D \uADFC\uAC70 \uD55C \uC904" });
        for (const row of rows) {
          const full = buffer.push(row);
          if (full) yield { chunkKind: SELLPIA_MANUAL_MATCH_CHUNK_KIND, payload: full, progress: progress4 };
        }
        const rest = buffer.flush();
        if (rest) yield { chunkKind: SELLPIA_MANUAL_MATCH_CHUNK_KIND, payload: rest, progress: progress4 };
      } finally {
        await site.closeManualMatch();
      }
    }
  };
  registerCollector(sellpiaManualMatchCollector);

  // packages/shared/src/schemas/coupang-catalog-snapshot.ts
  var COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT = 500;
  var COUPANG_CATALOG_MAX_MEDIA_PER_OWNER = 100;
  var COUPANG_CATALOG_MAX_DETAIL_MEDIA = COUPANG_CATALOG_MAX_MEDIA_PER_OWNER * (COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT + 1);
  var COUPANG_CATALOG_MAX_PRODUCT_BYTES = 512 * 1024;
  var COUPANG_CATALOG_MAX_RAW_BYTES = 64 * 1024;
  var COUPANG_CATALOG_MAX_DOCUMENT_BYTES = 64 * 1024;
  var COUPANG_CATALOG_MAX_DOCUMENTS_PER_PRODUCT = 2e3;
  var ExternalIdSchema = external_exports.string().trim().min(1).max(200);
  var NullableTextSchema = external_exports.string().trim().min(1).max(2e3).nullable();
  var HttpUrlSchema = external_exports.string().url().max(4096).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Provider URL must use HTTP(S)");
  function jsonBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  }
  function isJsonValue(value, seen = /* @__PURE__ */ new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const valid = Array.isArray(value) ? value.every((item) => isJsonValue(item, seen)) : Object.entries(value).every(([key, nested]) => key !== "__proto__" && key !== "prototype" && isJsonValue(nested, seen));
    seen.delete(value);
    return valid;
  }
  function addDuplicateIssue(ctx, path, field, value) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path,
      message: `duplicate ${field}: ${value}`
    });
  }
  var CoupangCatalogMediaRoleSchema = external_exports.enum(["primary", "detail", "option"]);
  var CoupangCatalogMediaV1Schema = external_exports.object({
    sourceUrl: HttpUrlSchema,
    role: CoupangCatalogMediaRoleSchema,
    sortOrder: external_exports.number().int().nonnegative(),
    externalOptionId: ExternalIdSchema.nullable()
  });
  var CoupangCatalogDetailMediaV1Schema = external_exports.object({
    sourceUrl: HttpUrlSchema,
    role: CoupangCatalogMediaRoleSchema,
    sortOrder: external_exports.number().int().nonnegative(),
    externalOptionIds: external_exports.array(ExternalIdSchema).max(COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT).optional(),
    externalOptionId: ExternalIdSchema.nullable().optional()
  }).superRefine((media, ctx) => {
    const ids = media.externalOptionIds ?? [];
    if (media.externalOptionId && ids.length > 0 && !ids.includes(media.externalOptionId)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["externalOptionId"],
        message: "legacy externalOptionId must be present in externalOptionIds"
      });
    }
  });
  var CoupangCatalogAttributeKindSchema = external_exports.enum(["purchase", "search"]);
  var CoupangCatalogAttributeV1Schema = external_exports.object({
    type: external_exports.string().trim().min(1).max(200),
    value: external_exports.string().trim().min(1).max(2e3),
    kind: CoupangCatalogAttributeKindSchema.optional(),
    attributeTypeId: external_exports.string().trim().min(1).max(200).nullable().optional(),
    exposed: external_exports.boolean().nullable().optional()
  });
  var CoupangCatalogOptionV1Schema = external_exports.object({
    externalOptionId: ExternalIdSchema,
    // `vendorItemId` is nullable in Wing inventory responses.  A typed
    // sellerProductItemId may still be used as the stable external option key,
    // but it must not be relabelled as a vendorItemId by the collector.
    vendorItemId: ExternalIdSchema.nullable().optional(),
    vendorInventoryItemId: ExternalIdSchema.nullable().optional(),
    sellerProductItemId: ExternalIdSchema.nullable().optional(),
    skuId: ExternalIdSchema.nullable().optional(),
    externalSkuCode: NullableTextSchema.optional(),
    stock: external_exports.number().int().nonnegative().nullable().optional(),
    stockQuantity: external_exports.number().int().nonnegative().nullable().optional(),
    soldOut: external_exports.boolean().nullable().optional(),
    optionName: NullableTextSchema,
    skuStatus: NullableTextSchema,
    salePrice: external_exports.number().int().nonnegative().nullable(),
    sellerSku: NullableTextSchema,
    modelNumber: NullableTextSchema,
    barcode: NullableTextSchema,
    attributes: external_exports.array(CoupangCatalogAttributeV1Schema).max(100),
    media: external_exports.array(CoupangCatalogMediaV1Schema).max(COUPANG_CATALOG_MAX_MEDIA_PER_OWNER),
    raw: external_exports.record(external_exports.unknown())
  }).superRefine((option, ctx) => {
    option.media.forEach((item, index) => {
      if (item.externalOptionId !== null && item.externalOptionId !== option.externalOptionId) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["media", index, "externalOptionId"],
          message: "media externalOptionId must match its option owner"
        });
      }
    });
    if (jsonBytes(option.raw) > COUPANG_CATALOG_MAX_RAW_BYTES) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["raw"],
        message: `option raw diagnostics exceed ${COUPANG_CATALOG_MAX_RAW_BYTES} bytes`
      });
    }
  });
  var CoupangCatalogBasicOptionV1Schema = CoupangCatalogOptionV1Schema;
  var CoupangCatalogBasicProductV1Schema = external_exports.object({
    externalProductId: ExternalIdSchema,
    registeredName: NullableTextSchema,
    displayName: NullableTextSchema,
    category: NullableTextSchema,
    manufacturer: NullableTextSchema,
    brand: NullableTextSchema,
    productStatus: NullableTextSchema,
    options: external_exports.array(CoupangCatalogBasicOptionV1Schema).min(1).max(COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT),
    media: external_exports.array(CoupangCatalogMediaV1Schema).max(COUPANG_CATALOG_MAX_MEDIA_PER_OWNER),
    raw: external_exports.record(external_exports.unknown())
  }).superRefine((product, ctx) => {
    const optionIds = /* @__PURE__ */ new Set();
    product.options.forEach((option, index) => {
      if (optionIds.has(option.externalOptionId)) {
        addDuplicateIssue(ctx, ["options", index, "externalOptionId"], "externalOptionId", option.externalOptionId);
      }
      optionIds.add(option.externalOptionId);
    });
    product.media.forEach((item, index) => {
      if (item.externalOptionId !== null && !optionIds.has(item.externalOptionId)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["media", index, "externalOptionId"],
          message: `media references unknown option: ${item.externalOptionId}`
        });
      }
    });
    if (jsonBytes(product.raw) > COUPANG_CATALOG_MAX_RAW_BYTES) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["raw"],
        message: `basic raw diagnostics exceed ${COUPANG_CATALOG_MAX_RAW_BYTES} bytes`
      });
    }
    if (jsonBytes(product) > COUPANG_CATALOG_MAX_PRODUCT_BYTES) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `basic product exceeds ${COUPANG_CATALOG_MAX_PRODUCT_BYTES} bytes`
      });
    }
  });
  var CoupangCatalogDetailDocumentKindSchema = external_exports.enum([
    "contents",
    "notices",
    "additionalNotices",
    "searchTags",
    "attributes",
    "internalAttributes",
    "certifications",
    "extraProperties"
  ]);
  var CoupangCatalogDetailDocumentValueSchema = external_exports.unknown().superRefine((value, ctx) => {
    if (!isJsonValue(value)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "detail document value must be finite JSON and must preserve explicit null"
      });
      return;
    }
    if (jsonBytes(value) > COUPANG_CATALOG_MAX_DOCUMENT_BYTES) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `detail document exceeds ${COUPANG_CATALOG_MAX_DOCUMENT_BYTES} bytes`
      });
    }
  });
  var CoupangCatalogDetailDocumentV1Schema = external_exports.object({
    id: ExternalIdSchema,
    kind: CoupangCatalogDetailDocumentKindSchema,
    value: CoupangCatalogDetailDocumentValueSchema
  });
  var CoupangCatalogDetailOptionV1Schema = external_exports.object({
    externalOptionId: ExternalIdSchema,
    vendorItemId: ExternalIdSchema.nullable().optional(),
    sellerProductItemId: ExternalIdSchema.nullable().optional(),
    externalVendorSku: NullableTextSchema.optional(),
    barcode: NullableTextSchema.optional(),
    modelNumber: NullableTextSchema.optional(),
    attributes: external_exports.array(CoupangCatalogAttributeV1Schema).max(100).optional(),
    documentIds: external_exports.array(ExternalIdSchema).max(COUPANG_CATALOG_MAX_DOCUMENTS_PER_PRODUCT),
    raw: external_exports.record(external_exports.unknown()).optional()
  });
  var CoupangCatalogDetailProductV1Schema = external_exports.object({
    externalProductId: ExternalIdSchema,
    options: external_exports.array(CoupangCatalogDetailOptionV1Schema).min(1).max(COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT),
    documents: external_exports.array(CoupangCatalogDetailDocumentV1Schema).max(COUPANG_CATALOG_MAX_DOCUMENTS_PER_PRODUCT),
    media: external_exports.array(CoupangCatalogDetailMediaV1Schema).max(COUPANG_CATALOG_MAX_DETAIL_MEDIA),
    raw: external_exports.record(external_exports.unknown())
  }).superRefine((product, ctx) => {
    const optionIds = /* @__PURE__ */ new Set();
    for (const [index, option] of product.options.entries()) {
      if (optionIds.has(option.externalOptionId)) {
        addDuplicateIssue(
          ctx,
          ["options", index, "externalOptionId"],
          "externalOptionId",
          option.externalOptionId
        );
      }
      optionIds.add(option.externalOptionId);
    }
    const documentsById = /* @__PURE__ */ new Map();
    for (const [index, document] of product.documents.entries()) {
      const previous = documentsById.get(document.id);
      if (previous) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["documents", index, "id"],
          message: `duplicate detail document id: ${document.id}`
        });
      } else {
        documentsById.set(document.id, document);
      }
      if (previous && stableDocumentValue(previous) !== stableDocumentValue(document)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["documents", index, "value"],
          message: `detail document id maps to more than one value: ${document.id}`
        });
      }
    }
    const documentValues = /* @__PURE__ */ new Set();
    for (const document of product.documents) {
      const key = `${document.kind}\0${stableDocumentValue(document.value)}`;
      if (documentValues.has(key)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["documents"],
          message: "detail documents must be deduplicated by kind and value"
        });
      }
      documentValues.add(key);
    }
    for (const [index, option] of product.options.entries()) {
      for (const [documentIndex, documentId] of option.documentIds.entries()) {
        if (!documentsById.has(documentId)) {
          ctx.addIssue({
            code: external_exports.ZodIssueCode.custom,
            path: ["options", index, "documentIds", documentIndex],
            message: `option references unknown detail document: ${documentId}`
          });
        }
      }
    }
    const mediaCountByOption = /* @__PURE__ */ new Map();
    let unassociatedMediaCount = 0;
    for (const [index, media] of product.media.entries()) {
      const optionRefs = new Set(
        media.externalOptionIds ?? (media.externalOptionId ? [media.externalOptionId] : [])
      );
      if (optionRefs.size === 0) {
        unassociatedMediaCount += 1;
        continue;
      }
      for (const optionId of optionRefs) {
        if (!optionIds.has(optionId)) {
          ctx.addIssue({
            code: external_exports.ZodIssueCode.custom,
            path: ["media", index, "externalOptionIds"],
            message: `media references unknown option: ${optionId}`
          });
        } else {
          mediaCountByOption.set(
            optionId,
            (mediaCountByOption.get(optionId) ?? 0) + 1
          );
        }
      }
    }
    for (const [optionId, count3] of mediaCountByOption.entries()) {
      if (count3 > COUPANG_CATALOG_MAX_MEDIA_PER_OWNER) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["media"],
          message: "media exceeds " + COUPANG_CATALOG_MAX_MEDIA_PER_OWNER + " references for option: " + optionId
        });
      }
    }
    if (unassociatedMediaCount > COUPANG_CATALOG_MAX_MEDIA_PER_OWNER) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["media"],
        message: "unassociated media exceeds " + COUPANG_CATALOG_MAX_MEDIA_PER_OWNER
      });
    }
    if (jsonBytes(product.raw) > COUPANG_CATALOG_MAX_RAW_BYTES) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["raw"],
        message: `detail raw diagnostics exceed ${COUPANG_CATALOG_MAX_RAW_BYTES} bytes`
      });
    }
    if (jsonBytes(product) > COUPANG_CATALOG_MAX_PRODUCT_BYTES) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `detail product exceeds ${COUPANG_CATALOG_MAX_PRODUCT_BYTES} bytes`
      });
    }
  });
  function stableDocumentValue(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(stableDocumentValue).join(",")}]`;
    return `{${Object.entries(value).filter(([, nested]) => nested !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${stableDocumentValue(nested)}`).join(",")}}`;
  }
  var CoupangCatalogDeletionOutcomeSchema = external_exports.enum(["deleted", "present", "not_found"]);
  var CoupangCatalogCollectionQualitySchema = external_exports.object({
    detailTargets: external_exports.number().int().nonnegative(),
    detailApplied: external_exports.number().int().nonnegative(),
    detailUnchanged: external_exports.number().int().nonnegative(),
    deletedProducts: external_exports.number().int().nonnegative(),
    unconfirmedAbsentProductIds: external_exports.array(ExternalIdSchema)
  });
  var WING_CATALOG_LIST_KIND = "channels.wing_catalog_list";
  var WING_CATALOG_DETAILS_KIND = "channels.wing_catalog_details";
  var WING_CATALOG_EXCEL_KIND = "channels.wing_catalog_excel";
  var WING_CATALOG_CHUNK_KINDS = {
    listingBasics: "listing_basics",
    fullDetails: "full_details",
    deletionConfirmation: "deletion_confirmation"
  };
  var WingCatalogProductIdsSchema = external_exports.array(ExternalIdSchema).max(1e5);
  var WingCatalogListScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid()
  }).strict();
  var WingCatalogListResultSchema = external_exports.object({
    listedProductCount: external_exports.number().int().nonnegative(),
    detailTargetProductIds: WingCatalogProductIdsSchema,
    absentProductIds: WingCatalogProductIdsSchema,
    next: external_exports.object({
      kind: external_exports.literal(WING_CATALOG_DETAILS_KIND),
      scope: external_exports.lazy(() => WingCatalogDetailsScopeSchema)
    }).strict().nullable()
  }).strict();
  var WingCatalogDetailsScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    detailTargetProductIds: WingCatalogProductIdsSchema,
    absentProductIds: WingCatalogProductIdsSchema,
    /**
     * 어디서 시작했나: `list`는 목록 kind의 `result.next`(동기화 연쇄), `manual`은 운영자가 직접 시작한 상품 하나
     * 다시 받기. 카탈로그 신선도는 동기화 연쇄의 상세만 센다.
     */
    via: external_exports.enum(["list", "manual"]).default("manual")
  }).strict();
  var WingCatalogExcelScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    observedAt: external_exports.string().datetime({ offset: true }).optional()
  }).strict();
  var WingCatalogDeletionConfirmationItemSchema = external_exports.object({
    externalProductId: ExternalIdSchema,
    outcome: CoupangCatalogDeletionOutcomeSchema,
    productStatus: NullableTextSchema.optional().default(null)
  }).strict();
  var WingCatalogExcelResultSchema = external_exports.object({
    createdProductCount: external_exports.number().int().nonnegative(),
    updatedProductCount: external_exports.number().int().nonnegative(),
    createdSkuCount: external_exports.number().int().nonnegative(),
    updatedSkuCount: external_exports.number().int().nonnegative(),
    skippedRowCount: external_exports.number().int().nonnegative()
  }).strict();

  // extensions/src/collectors/channels.wing_catalog_details/index.ts
  var DETAILS_PER_CHUNK = 20;
  var TOO_LARGE_CODES = /* @__PURE__ */ new Set(["WING_CATALOG_PAYLOAD_TOO_LARGE", "RUNTIME_CHUNK_TOO_LARGE"]);
  var CATALOG_DETAILS_UNREACHABLE = "CATALOG_DETAILS_UNREACHABLE";
  var MAX_CONSECUTIVE_DETAIL_FAILURES = 10;
  var PROBE_BATCH = 100;
  var wingCatalogDetailsCollector = {
    kind: WING_CATALOG_DETAILS_KIND,
    site: "wing",
    async *collect(plan, site, { signal }) {
      const targets = plan.detailTargetProductIds;
      const absent = plan.absentProductIds;
      const missing = [];
      let consecutiveFailures = 0;
      let detailsDone = 0;
      let absentChecked = 0;
      const progress4 = () => ({
        detailsDone,
        detailTargets: targets.length,
        absentChecked,
        absentTotal: absent.length,
        detailsMissing: [...missing]
      });
      const details = new ChunkBuffer({ maxItems: DETAILS_PER_CHUNK, label: "Wing \uC0C1\uC138 \uC0C1\uD488" });
      const chunk = (chunkKind, payload) => ({ chunkKind, payload, progress: progress4() });
      for (const externalProductId of targets) {
        if (signal.aborted) return;
        let product;
        let full;
        try {
          product = await site.productDetail(externalProductId);
          consecutiveFailures = 0;
          if (!product) {
            missing.push({ externalProductId, reason: "not_found" });
            continue;
          }
          full = details.push(product);
        } catch (error) {
          if (isRuntimeError(error) && TOO_LARGE_CODES.has(error.code)) {
            missing.push({ externalProductId, reason: "too_large" });
            continue;
          }
          if (isRuntimeError(error) && error.code === SITE_REQUEST_FAILED) {
            const bodyHead = typeof error.details?.bodyHead === "string" ? error.details.bodyHead : null;
            missing.push({ externalProductId, reason: requestFailureReason(error.details), bodyHead });
            consecutiveFailures += 1;
            if (consecutiveFailures >= MAX_CONSECUTIVE_DETAIL_FAILURES) {
              throw new RuntimeError(
                CATALOG_DETAILS_UNREACHABLE,
                `\uCFE0\uD321 \uC719 \uC0C1\uD488 \uC0C1\uC138\uB97C \uC5F0\uC18D ${consecutiveFailures}\uAC74 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4${bodyHead ? `: ${bodyHead}` : "."}`,
                { consecutiveFailures, lastExternalProductId: externalProductId, lastBodyHead: bodyHead, lastStatus: error.details?.status ?? null },
                error
              );
            }
            continue;
          }
          throw error;
        }
        detailsDone += 1;
        if (full) yield chunk(WING_CATALOG_CHUNK_KINDS.fullDetails, full);
      }
      const rest = details.flush();
      if (rest) yield chunk(WING_CATALOG_CHUNK_KINDS.fullDetails, rest);
      for (let offset = 0; offset < absent.length; offset += PROBE_BATCH) {
        if (signal.aborted) return;
        const confirmations = await site.probeDeleted(absent.slice(offset, offset + PROBE_BATCH));
        absentChecked += confirmations.length;
        yield chunk(WING_CATALOG_CHUNK_KINDS.deletionConfirmation, confirmations);
      }
    }
  };
  function requestFailureReason(details) {
    if (details?.reason === "not_json") return "not_json";
    return typeof details?.status === "number" ? `http_${details.status}` : "network";
  }
  registerCollector(wingCatalogDetailsCollector);

  // extensions/src/collectors/channels.wing_catalog_excel/index.ts
  var CATALOG_EXCEL_FAILED = "CATALOG_EXCEL_FAILED";
  var CATALOG_EXCEL_TIMEOUT = "CATALOG_EXCEL_TIMEOUT";
  var WORKBOOK_PART_CHARS = 9e5;
  var WORKBOOK_CHUNK_KIND = "workbook";
  var PROGRESS_CHUNK_KIND = "excel_progress";
  var POLL_INTERVAL_MS = 1e4;
  var MAX_POLLS = 240;
  var wingCatalogExcelCollector = {
    kind: WING_CATALOG_EXCEL_KIND,
    site: "wing",
    async *collect(_plan, site, { signal }) {
      const description = `kiditem_${(/* @__PURE__ */ new Date()).toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
      await site.requestCatalogExcel(description);
      const progress4 = (value) => ({ chunkKind: PROGRESS_CHUNK_KIND, payload: [], progress: value });
      yield progress4({ status: "REQUESTED", executeCount: 0, totalCount: null });
      let completed = null;
      for (let poll = 0; poll < MAX_POLLS && !completed; poll += 1) {
        if (signal.aborted) return;
        if (poll > 0) await site.pause(POLL_INTERVAL_MS, signal);
        const request = await site.catalogExcelRequest(description);
        if (!request) continue;
        yield progress4({ status: request.status, executeCount: request.executeCount, totalCount: request.totalCount });
        if (request.status === "COMPLETED") completed = request;
        else if (/FAIL|ABORT|CANCEL|ERROR/i.test(request.status)) {
          throw new RuntimeError(CATALOG_EXCEL_FAILED, `\uCFE0\uD321 \uC719\uC774 \uC0C1\uD488\uC815\uBCF4 \uC5D1\uC140 \uC0DD\uC131\uC744 \uBA48\uCDC4\uC2B5\uB2C8\uB2E4(${request.status}). \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.`, { status: request.status });
        }
      }
      if (!completed) {
        if (signal.aborted) return;
        throw new RuntimeError(CATALOG_EXCEL_TIMEOUT, "\uCFE0\uD321 \uC719 \uC0C1\uD488\uC815\uBCF4 \uC5D1\uC140\uC774 \uC81C\uC2DC\uAC04\uC5D0 \uB9CC\uB4E4\uC5B4\uC9C0\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
      }
      const bytes = await site.downloadCatalogExcel(completed.id);
      const encoded = base64(bytes);
      for (let offset = 0; offset < encoded.length; offset += WORKBOOK_PART_CHARS) {
        if (signal.aborted) return;
        yield {
          chunkKind: WORKBOOK_CHUNK_KIND,
          payload: [encoded.slice(offset, offset + WORKBOOK_PART_CHARS)],
          progress: { status: "DOWNLOADED", bytes: bytes.byteLength }
        };
      }
    }
  };
  function base64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return btoa(binary);
  }
  registerCollector(wingCatalogExcelCollector);

  // extensions/src/collectors/channels.wing_catalog_list/index.ts
  var CATALOG_LIST_INCOMPLETE = "CATALOG_LIST_INCOMPLETE";
  var PRODUCTS_PER_CHUNK = 20;
  var wingCatalogListCollector = {
    kind: WING_CATALOG_LIST_KIND,
    site: "wing",
    async *collect(plan, site, { signal }) {
      const buffer = new ChunkBuffer({ maxItems: PRODUCTS_PER_CHUNK, label: "Wing \uBAA9\uB85D \uC0C1\uD488" });
      const seen = /* @__PURE__ */ new Set();
      let expected = null;
      let progress4 = {};
      const chunk = (payload) => ({ chunkKind: WING_CATALOG_CHUNK_KINDS.listingBasics, payload, progress: progress4 });
      for (let page = 1; expected === null || page <= expected.totalPages; page += 1) {
        if (signal.aborted) return;
        const result = await site.searchInventory(page, plan.vendorId ?? null);
        if (expected === null) expected = { totalItems: result.totalItems, totalPages: result.totalPages };
        else if (result.totalItems !== expected.totalItems || result.totalPages !== expected.totalPages) {
          throw incomplete(`\uC218\uC9D1 \uC911 Wing \uC0C1\uD488 \uC218\uAC00 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4(${expected.totalItems} \u2192 ${result.totalItems}). \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD574 \uC8FC\uC138\uC694.`);
        }
        progress4 = { listedProducts: seen.size + result.products.length, totalProducts: expected.totalItems, page, totalPages: expected.totalPages };
        for (const product of result.products) {
          if (seen.has(product.externalProductId)) {
            throw incomplete(`Wing \uBAA9\uB85D\uC758 \uD398\uC774\uC9C0\uAC00 \uACB9\uCCE4\uC2B5\uB2C8\uB2E4(${product.externalProductId}). \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD574 \uC8FC\uC138\uC694.`);
          }
          seen.add(product.externalProductId);
          const full = buffer.push(product);
          if (full) yield chunk(full);
        }
      }
      if (expected && seen.size !== expected.totalItems) {
        throw incomplete(`Wing \uBAA9\uB85D\uC744 \uB2E4 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4(${seen.size}/${expected.totalItems}). \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD574 \uC8FC\uC138\uC694.`);
      }
      const rest = buffer.flush();
      if (rest) yield chunk(rest);
    }
  };
  function incomplete(message) {
    return new RuntimeError(CATALOG_LIST_INCOMPLETE, message);
  }
  registerCollector(wingCatalogListCollector);

  // packages/shared/src/schemas/rocket-purchase-preview.ts
  var ROCKET_PO_ROW_LIMIT = 4e3;
  var ROCKET_PO_LIST_PAGE_EVIDENCE_LIMIT = 1e5;
  var boundedText3 = (max) => external_exports.string().trim().max(max);
  var requiredText3 = (max) => boundedText3(max).min(1);
  var isoDay5 = external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  var RocketPoSourceBeginSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    from: isoDay5,
    to: isoDay5,
    status: external_exports.enum(["RP", "PA", "RI", "CI", ""]),
    dateType: external_exports.enum(["WAREHOUSING_PLAN_DATE", "PURCHASE_ORDER_DATE"]),
    requireConfirmation: external_exports.boolean()
  }).strict().refine((value) => value.from <= value.to, "Invalid date range");
  var RocketPoCollectionEvidenceSchema = external_exports.object({
    collectionRunId: external_exports.string().uuid(),
    vendorId: boundedText3(120),
    listPagesRead: external_exports.number().int().min(0).max(ROCKET_PO_LIST_PAGE_EVIDENCE_LIMIT),
    totalListPages: external_exports.number().int().min(0).max(ROCKET_PO_LIST_PAGE_EVIDENCE_LIMIT),
    truncated: external_exports.boolean(),
    detailPoCount: external_exports.number().int().min(0).max(ROCKET_PO_ROW_LIMIT),
    failedPoNumbers: external_exports.array(requiredText3(80)).max(ROCKET_PO_ROW_LIMIT)
  }).strict().superRefine((value, ctx) => {
    if (new Set(value.failedPoNumbers).size !== value.failedPoNumbers.length) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["failedPoNumbers"],
        message: "Failed PO numbers must be unique"
      });
    }
  });
  var RocketPoCatalogRowSchema = external_exports.object({
    poLineId: requiredText3(300),
    poNumber: requiredText3(80),
    vendorId: boundedText3(120),
    productNo: requiredText3(60),
    barcode: boundedText3(80),
    productName: requiredText3(240),
    orderQty: external_exports.number().int().nonnegative().max(1e7),
    plannedDeliveryDate: isoDay5,
    poStatusCode: boundedText3(20).optional(),
    businessDateBasis: external_exports.enum(["ordered_at", "expected_inbound"]).optional(),
    confirmation: external_exports.object({
      center: boundedText3(120),
      inboundType: boundedText3(80),
      poStatus: boundedText3(80),
      returnManager: boundedText3(120),
      returnContact: boundedText3(80),
      returnAddress: boundedText3(300),
      purchasePrice: external_exports.number().int().nonnegative().max(1e9),
      supplyPrice: external_exports.number().int().nonnegative().max(1e9),
      vat: external_exports.number().int().nonnegative().max(1e9),
      totalPurchase: external_exports.number().int().nonnegative().max(1e9),
      poRegisteredAt: boundedText3(40),
      xdock: boundedText3(20)
    }).strict().optional()
  }).strict();
  var RocketSavedPoListRequestSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    from: isoDay5,
    to: isoDay5,
    status: boundedText3(80).optional()
  }).strict().superRefine((value, ctx) => {
    if (value.to < value.from) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["to"],
        message: "to must be on or after from"
      });
    }
  });
  var RocketSavedPoSummarySchema = external_exports.object({
    /** 이 발주를 발행한 로켓 PO 수집 실행(Orders `orders.coupang_rocket_po`, KID-359). */
    rocketPoOperationId: external_exports.string().uuid(),
    poNumber: requiredText3(80),
    orderedAt: boundedText3(40),
    plannedDeliveryDate: isoDay5,
    status: boundedText3(80),
    vendorId: boundedText3(120),
    centerName: boundedText3(120),
    inboundType: boundedText3(80),
    firstProductName: requiredText3(240),
    skuCount: external_exports.number().int().nonnegative(),
    orderQuantity: external_exports.number().int().nonnegative(),
    /** Null when any listed line has no provider-confirmed total. */
    orderAmount: external_exports.number().int().nonnegative().nullable(),
    collectedAt: external_exports.string().datetime()
  }).strict();
  var RocketSavedPoSnapshotSchema = external_exports.object({
    rocketPoOperationId: external_exports.string().uuid(),
    channelAccountId: external_exports.string().uuid(),
    collection: RocketPoCollectionEvidenceSchema,
    rows: external_exports.array(RocketPoCatalogRowSchema).max(ROCKET_PO_ROW_LIMIT)
  }).strict();
  var RocketSavedPoCollectionSchema = RocketSavedPoSnapshotSchema.extend({
    // 이 계정에서 이미 확정 엑셀로 나간 PO 라인. 수집은 매번 전량 스냅샷이라 같은 라인이
    // 여러 수집본에 반복 등장한다(`poLineId` 는 수집본 간에 안정적). 운영자가 "이번에
    // 새로 들어온 것만" 보려면 이 집합을 빼야 한다. 행 스키마는 요청 본문으로도 쓰이므로
    // 행에 필드를 더하지 않고 별도 목록으로 내려준다.
    exportedPoLineIds: external_exports.array(requiredText3(300)).max(ROCKET_PO_ROW_LIMIT)
  }).strict();
  var RocketPurchaseRequestBaseSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    collection: RocketPoCollectionEvidenceSchema,
    rows: external_exports.array(RocketPoCatalogRowSchema).max(ROCKET_PO_ROW_LIMIT),
    editedQuantities: external_exports.record(
      external_exports.string().min(1).max(300),
      external_exports.number().int().nonnegative().max(1e7)
    ).default({}),
    clampEditedQuantities: external_exports.boolean().optional()
  }).strict();
  function validateRocketPurchaseLines(value, ctx) {
    const lineIds = value.rows.map(({ poLineId }) => poLineId);
    if (new Set(lineIds).size !== lineIds.length) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["rows"],
        message: "PO line IDs must be unique"
      });
    }
    const known = new Set(lineIds);
    for (const lineId of Object.keys(value.editedQuantities)) {
      if (!known.has(lineId)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["editedQuantities", lineId],
          message: "Edited quantity references an unknown PO line"
        });
      }
    }
  }
  var RocketPurchasePreviewScopeSchema = external_exports.enum([
    "all_rows",
    "confirmation_requested"
  ]);
  var RocketPurchasePreviewRequestSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    rocketPoOperationId: external_exports.string().uuid(),
    inventoryOperationId: external_exports.string().uuid(),
    editedQuantities: RocketPurchaseRequestBaseSchema.shape.editedQuantities,
    clampEditedQuantities: external_exports.boolean().optional(),
    previewScope: RocketPurchasePreviewScopeSchema.optional()
  }).strict();
  var RocketPurchasePreviewDecisionSchema = RocketPurchaseRequestBaseSchema.extend({ previewScope: RocketPurchasePreviewScopeSchema.optional() }).strict().superRefine(validateRocketPurchaseLines);
  var ROCKET_SHORTAGE_REASONS = [
    "\uD611\uB825\uC0AC \uC7AC\uACE0\uBD80\uC871 - \uC218\uC694\uC608\uCE21 \uC624\uB958",
    "\uD611\uB825\uC0AC \uC7AC\uACE0\uBD80\uC871 - \uC0DD\uC0B0\uCE90\uD30C \uBD80\uC871 (\uC124\uBE44\uB77C\uC778/\uC6D0\uC790\uC7AC/\uC778\uB825/\uD734\uBB34\u2026 \uB4F1\uB4F1)",
    "\uD611\uB825\uC0AC \uC7AC\uACE0\uBD80\uC871 - \uD488\uC9C8\uC801 \uC774\uC288 (\uC720\uD574\uBB3C\uC9C8 \uBC1C\uACAC / \uC720\uD1B5\uAE30\uD55C \uBBF8\uB2EC)",
    "\uD611\uB825\uC0AC \uC7AC\uACE0\uBD80\uC871 - \uC7AC\uACE0 \uD560\uB2F9\uC815\uCC45",
    "\uD611\uB825\uC0AC \uC7AC\uACE0\uBD80\uC871 - \uC218\uC785\uC0C1\uD488 \uC785\uACE0\uC9C0\uC5F0 (\uC120\uC801/\uD1B5\uAD00\uC9C0\uC5F0)",
    "\uC81C\uC870\uC0AC \uC0DD\uC0B0\uC911\uB2E8 \uD639\uC740 \uACF5\uAE09\uC0AC \uCDE8\uAE09\uC911\uB2E8 - \uC81C\uD488 \uB9AC\uB274\uC5BC/\uBAA8\uB378 \uBCC0\uACBD",
    "\uC81C\uC870\uC0AC \uC0DD\uC0B0\uC911\uB2E8 \uD639\uC740 \uACF5\uAE09\uC0AC \uCDE8\uAE09\uC911\uB2E8 - \uC2DC\uC7A5 \uB2E8\uC885",
    "\uC81C\uC870\uC0AC \uC0DD\uC0B0\uC911\uB2E8 \uD639\uC740 \uACF5\uAE09\uC0AC \uCDE8\uAE09\uC911\uB2E8 - \uC0AC\uC5C5\uC790\uBCC0\uACBD",
    "FC \uC785\uACE0\uAE30\uC900 \uBBF8\uB2EC\uB85C \uD68C\uC1A1",
    "\uAC00\uACA9 \uC774\uC288 (Price) - \uB9E4\uC785\uAC00 \uC778\uD558 \uD611\uC0C1 \uC911",
    "\uAC00\uACA9 \uC774\uC288 (Price) - \uB9E4\uC785\uAC00 \uC778\uC0C1 \uD611\uC0C1 \uC911",
    "\uAC00\uACA9 \uC774\uC288 (Price) - \uCFE0\uD321 \uCD5C\uC800\uAC00 \uB9E4\uCE6D",
    "\uCD5C\uC18C\uBC1C\uC8FC\uB7C9 \uBCC0\uACBD \uD544\uC694 (MOQ)",
    "\uCFE0\uD321 \uC694\uCCAD \uBBF8\uB0A9",
    "\uC2DC\uC98C\uC0C1\uD488\uC73C\uB85C \uB2E4\uC74C \uC2DC\uC98C\uC804\uAE4C\uC9C0 \uC0DD\uC0B0 \uD639\uC740 \uCDE8\uAE09\uC911\uB2E8",
    "\uCC9C\uC7AC\uC9C0\uBCC0/\uC7AC\uB09C\uACFC \uAC19\uC740 \uBD88\uAC00\uD56D\uB825\uC801\uC778 \uC0AC\uC720\uB85C \uBBF8\uB0A9",
    "\uC5C5\uCCB4 \uD734\uBB34",
    "\uC7AC\uBB34 \uAD00\uB828 \uC0AC\uC720",
    "FC \uC785\uACE0 \uC774\uC288 - FC \uC2AC\uB86F \uC608\uC57D \uBD88\uAC00",
    "FC \uC785\uACE0 \uC774\uC288 - \uBC00\uD06C\uB7F0 \uC608\uC57D\uBD88\uAC00"
  ];
  var RocketShortageReasonSchema = external_exports.enum(ROCKET_SHORTAGE_REASONS);
  var RocketWorkbookDecisionRequestSchema = RocketPurchaseRequestBaseSchema.omit({ clampEditedQuantities: true }).extend({
    idempotencyKey: external_exports.string().uuid(),
    selectedPoLineIds: external_exports.array(requiredText3(300)).min(1).max(4e3).optional(),
    shortageReasons: external_exports.record(
      external_exports.string().min(1).max(300),
      RocketShortageReasonSchema
    ),
    artifactFileName: requiredText3(240),
    artifactContentType: external_exports.literal(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
  }).strict().superRefine((value, ctx) => {
    validateRocketPurchaseLines(value, ctx);
    const rowsByLineId = new Map(value.rows.map((row) => [row.poLineId, row]));
    const selectedPoLineIds = value.selectedPoLineIds ?? value.rows.map(({ poLineId }) => poLineId);
    if (new Set(selectedPoLineIds).size !== selectedPoLineIds.length) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["selectedPoLineIds"],
        message: "Selected workbook PO line IDs must be unique"
      });
    }
    for (const lineId of selectedPoLineIds) {
      if (!rowsByLineId.has(lineId)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["selectedPoLineIds", lineId],
          message: "Selected workbook PO line references an unknown source line"
        });
      }
    }
    const selectedLineIds = new Set(selectedPoLineIds);
    for (const row of value.rows.filter(({ poLineId }) => selectedLineIds.has(poLineId))) {
      if (!row.confirmation || row.barcode.length === 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["rows", row.poLineId, "confirmation"],
          message: "Every workbook line requires complete workbook evidence"
        });
      }
      if (!Object.hasOwn(value.editedQuantities, row.poLineId)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["editedQuantities", row.poLineId],
          message: "Every workbook line requires an explicit reviewed quantity"
        });
        continue;
      }
      const quantity = value.editedQuantities[row.poLineId];
      if (quantity > row.orderQty) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["editedQuantities", row.poLineId],
          message: "Workbook quantity must not exceed the PO order quantity"
        });
      }
      const hasShortageReason = Object.hasOwn(value.shortageReasons, row.poLineId);
      if (quantity < row.orderQty && !hasShortageReason) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["shortageReasons", row.poLineId],
          message: "Every short workbook line requires a shortage reason"
        });
      }
      if (quantity >= row.orderQty && hasShortageReason) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["shortageReasons", row.poLineId],
          message: "A full workbook line must not include a shortage reason"
        });
      }
    }
    for (const lineId of Object.keys(value.shortageReasons)) {
      if (!selectedLineIds.has(lineId)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["shortageReasons", lineId],
          message: "Shortage reason references an unselected PO line"
        });
      }
    }
  });
  var RocketWorkbookExportRequestSchema = RocketWorkbookDecisionRequestSchema.innerType().omit({ collection: true, rows: true }).extend({ rocketPoOperationId: external_exports.string().uuid(), inventoryOperationId: external_exports.string().uuid() }).strict();
  var RocketPurchasePreviewReasonSchema = external_exports.enum([
    "mapping_required",
    "configuration_required",
    "review_required",
    "inventory_unavailable",
    "insufficient_capacity"
  ]);
  var RocketPoCatalogPublicationSchema = external_exports.object({
    rocketPoOperationId: external_exports.string().uuid(),
    channelAccountId: external_exports.string().uuid(),
    actualCutoffAt: external_exports.string().datetime(),
    rowCount: external_exports.number().int().nonnegative().max(ROCKET_PO_ROW_LIMIT)
  }).strict();
  var RocketPurchasePreviewComponentSchema = external_exports.object({
    masterProductId: external_exports.string().uuid(),
    code: requiredText3(120).nullable(),
    name: requiredText3(240).nullable(),
    optionName: external_exports.string().trim().min(1).max(240).nullable(),
    quantity: external_exports.number().int().positive(),
    currentStock: external_exports.number().int().nonnegative().nullable()
  }).strict();
  var RocketPurchasePreviewRowSchema = external_exports.object({
    poLineId: requiredText3(300),
    poNumber: requiredText3(80),
    productNo: requiredText3(60),
    productName: requiredText3(240),
    plannedDeliveryDate: isoDay5,
    orderQuantity: external_exports.number().int().nonnegative(),
    recommendedQuantity: external_exports.number().int().nonnegative().nullable(),
    maxQuantity: external_exports.number().int().nonnegative().nullable(),
    editedQuantity: external_exports.number().int().nonnegative().nullable(),
    reason: RocketPurchasePreviewReasonSchema.nullable(),
    channelListingOptionId: external_exports.string().uuid().nullable(),
    masterProductId: external_exports.string().uuid().nullable(),
    components: external_exports.array(RocketPurchasePreviewComponentSchema).max(50)
  }).strict().superRefine((row, ctx) => {
    if (row.masterProductId !== null && row.channelListingOptionId === null) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["channelListingOptionId"],
        message: "A confirmed product requires a channel listing option identity"
      });
    }
  });
  var RocketPurchasePreviewReadyResponseSchema = external_exports.object({
    status: external_exports.literal("ready"),
    collectionRunId: external_exports.string().uuid(),
    catalog: RocketPoCatalogPublicationSchema.nullable(),
    inventoryGeneration: external_exports.string().regex(/^\d+$/).nullable(),
    rows: external_exports.array(RocketPurchasePreviewRowSchema).max(ROCKET_PO_ROW_LIMIT)
  }).strict();
  var RocketWorkbookExportResponseSchema = external_exports.object({
    exportId: external_exports.string().uuid(),
    duplicate: external_exports.boolean(),
    inventoryGeneration: external_exports.string().regex(/^\d+$/).nullable(),
    generatedAt: external_exports.string().datetime(),
    artifact: external_exports.object({
      fileName: requiredText3(240),
      contentType: external_exports.literal(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
      sha256: external_exports.string().regex(/^[a-f0-9]{64}$/),
      byteLength: external_exports.number().int().positive().max(10 * 1024 * 1024)
    }).strict(),
    totals: external_exports.object({
      lineCount: external_exports.number().int().nonnegative().max(ROCKET_PO_ROW_LIMIT),
      orderQuantity: external_exports.number().int().nonnegative(),
      workbookQuantity: external_exports.number().int().nonnegative(),
      componentQuantity: external_exports.number().int().nonnegative()
    }).strict(),
    rows: external_exports.array(external_exports.object({
      poLineId: requiredText3(300),
      workbookQuantity: external_exports.number().int().nonnegative(),
      shortageReason: RocketShortageReasonSchema.nullable()
    }).strict()).max(ROCKET_PO_ROW_LIMIT)
  }).strict();
  var RocketWorkbookAbandonRequestSchema = external_exports.object({
    exportId: external_exports.string().uuid()
  }).strict();

  // packages/shared/src/schemas/coupang-direct-order.ts
  var CoupangDirectTransportSchema = external_exports.enum(["SHIPMENT", "MILKRUN"]);
  var CoupangDirectOrderStatusSchema = external_exports.enum(["PA", "\uBC1C\uC8FC\uD655\uC815"]);
  var CoupangDirectOrderItemSchema = external_exports.object({
    skuId: external_exports.string().trim().min(1),
    barcode: external_exports.string().trim(),
    name: external_exports.string().trim().min(1),
    qty: external_exports.number().int().positive(),
    amount: external_exports.number().nonnegative()
  }).strict();
  var optionalDisplayText = external_exports.preprocess((value) => {
    if (value == null) return void 0;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }, external_exports.string().optional());
  var optionalDisplayZip = external_exports.preprocess((value) => {
    if (value == null) return void 0;
    if (typeof value === "number") return value;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }, external_exports.union([external_exports.string(), external_exports.number().int().nonnegative()]).optional());
  var optionalDisplayDate = external_exports.preprocess(
    (value) => value == null ? "" : value,
    external_exports.string().trim()
  );
  var CoupangDirectPurchaseOrderSchema = external_exports.object({
    seq: external_exports.union([
      external_exports.string().trim().min(1),
      external_exports.number().int().nonnegative().transform(String)
    ]),
    status: CoupangDirectOrderStatusSchema,
    center: external_exports.string().trim().min(1),
    transport: CoupangDirectTransportSchema,
    edd: optionalDisplayDate,
    reg: external_exports.string().trim().min(1),
    // 발주유형이 긴급인지(쿠팡 purchaseOrderType = URGENT). 구버전 확장은 안 보내므로 선택값.
    urgent: external_exports.boolean().optional(),
    items: external_exports.array(CoupangDirectOrderItemSchema)
  }).strict();
  var CoupangDirectCenterSchema = external_exports.object({
    addr: optionalDisplayText,
    zip: optionalDisplayZip,
    contact: optionalDisplayText
  }).strict().transform((center) => {
    const clean2 = {};
    if (center.addr !== void 0) clean2.addr = center.addr;
    if (center.zip !== void 0) clean2.zip = center.zip;
    if (center.contact !== void 0) clean2.contact = center.contact;
    return clean2;
  });
  var CoupangDirectOrderCollectionRequestSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    pos: external_exports.array(CoupangDirectPurchaseOrderSchema).max(4e3),
    centers: external_exports.record(external_exports.string(), CoupangDirectCenterSchema),
    transport: CoupangDirectTransportSchema
  }).strict().superRefine((request, ctx) => {
    const seenLineKeys = /* @__PURE__ */ new Set();
    request.pos.forEach((purchaseOrder, purchaseOrderIndex) => {
      purchaseOrder.items.forEach((item, itemIndex) => {
        const lineKey = `${purchaseOrder.seq}\0${item.skuId}`;
        if (seenLineKeys.has(lineKey)) {
          ctx.addIssue({
            code: external_exports.ZodIssueCode.custom,
            path: ["pos", purchaseOrderIndex, "items", itemIndex, "skuId"],
            message: "Duplicate (seq, skuId) line"
          });
        }
        seenLineKeys.add(lineKey);
      });
    });
  });
  var CoupangDirectPoSnapshotItemSchema = external_exports.object({
    barcode: external_exports.string(),
    name: external_exports.string(),
    qty: external_exports.number().int().nonnegative(),
    amount: external_exports.number().nonnegative()
  }).strict();
  var CoupangDirectPoSnapshotEntrySchema = external_exports.object({
    purchaseOrderSeq: external_exports.string().trim().min(1),
    centerName: external_exports.string(),
    transport: CoupangDirectTransportSchema,
    deliveryDate: external_exports.string().nullable(),
    orderedDate: external_exports.string().nullable(),
    isUrgent: external_exports.boolean(),
    skuCount: external_exports.number().int().nonnegative(),
    orderQuantity: external_exports.number().int().nonnegative(),
    orderAmount: external_exports.number().nonnegative(),
    items: external_exports.array(CoupangDirectPoSnapshotItemSchema)
  }).strict();
  var CoupangDirectPoSnapshotResponseSchema = external_exports.object({
    channelAccountId: external_exports.string(),
    /** 이 달력의 근거인 성공한 directship 실행. 변환은 이 실행으로 보낸다. 아직 성공한 수집이 없으면 null. */
    operationId: external_exports.string().uuid().nullable(),
    /** 그 실행이 끝난 시각. */
    collectedAt: external_exports.string().nullable(),
    entries: external_exports.array(CoupangDirectPoSnapshotEntrySchema)
  });

  // packages/shared/src/schemas/orders-operations.ts
  var COUPANG_SHIPMENT_SUMMARY_KIND = "orders.coupang_shipment_summary";
  var COUPANG_ROCKET_PO_KIND = "orders.coupang_rocket_po";
  var COUPANG_DIRECTSHIP_KIND = "orders.coupang_directship";
  var SELLPIA_SHIPMENT_TRACKING_KIND = "orders.sellpia_shipment_tracking";
  var MALL_ORDERS_KIND = "orders.mall_orders";
  var isoDay6 = external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
  var CoupangShipmentSummaryScopeSchema = external_exports.object({
    maxPages: external_exports.number().int().min(1).max(60).optional()
  }).strict();
  var COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS = 10;
  var CoupangShipmentDateItemSchema = external_exports.object({
    date: isoDay6,
    count: external_exports.number().int().min(1).max(1e6),
    boxes: external_exports.number().int().min(0).max(1e6)
  }).strict();
  var CoupangShipmentScanSchema = external_exports.object({
    maxPages: external_exports.number().int().min(1).max(60),
    scannedPages: external_exports.number().int().min(1).max(60),
    totalRows: external_exports.number().int().min(0),
    stopReason: external_exports.enum(["empty_page", "short_page", "max_pages"]),
    lastPageRowCount: external_exports.number().int().min(0),
    pageRowCounts: external_exports.array(external_exports.number().int().min(0)).min(1).max(60),
    validatedTable: external_exports.literal(true)
  }).strict();
  var CoupangShipmentSummaryProgressSchema = external_exports.object({
    current: external_exports.number().int().min(0),
    total: external_exports.number().int().min(1)
  }).passthrough();
  var CoupangShipmentSummaryResultSchema = external_exports.object({
    dates: external_exports.number().int().nonnegative(),
    rows: external_exports.number().int().nonnegative()
  }).strict();
  var CoupangRocketPoPlanSchema = RocketPoSourceBeginSchema.innerType().extend({
    vendorExpectations: external_exports.object({
      rocketVendorId: external_exports.string().max(120).nullable(),
      sharedCoupangVendorId: external_exports.string().max(120).nullable()
    }).strict()
  }).strict();
  var CoupangRocketPoChunkItemSchema = external_exports.object({
    poNumber: external_exports.string().min(1).max(80),
    rows: external_exports.array(RocketPoCatalogRowSchema).min(1).max(ROCKET_PO_ROW_LIMIT)
  }).strict();
  var CoupangRocketPoScanSchema = external_exports.object({
    vendorId: external_exports.string().max(120),
    listPagesRead: external_exports.number().int().min(0).max(1e5),
    totalListPages: external_exports.number().int().min(0).max(1e5),
    detailPoCount: external_exports.number().int().min(0).max(ROCKET_PO_ROW_LIMIT),
    proof: external_exports.object({
      from: isoDay6,
      to: isoDay6,
      status: external_exports.enum(["RP", "PA", "RI", "CI", ""]),
      dateType: external_exports.enum(["WAREHOUSING_PLAN_DATE", "PURCHASE_ORDER_DATE"]),
      validatedList: external_exports.literal(true)
    }).strict()
  }).strict();
  var CoupangRocketPoProgressSchema = external_exports.object({
    phase: external_exports.enum(["session", "list", "detail", "done"]),
    current: external_exports.number().int().min(0),
    total: external_exports.number().int().min(0)
  }).passthrough();
  var CoupangRocketPoResultSchema = external_exports.object({
    purchaseOrders: external_exports.number().int().nonnegative(),
    lines: external_exports.number().int().nonnegative()
  }).strict();
  var CoupangDirectshipScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid()
  }).strict();
  var CoupangDirectshipPlanSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    captureMode: external_exports.literal("browser")
  }).strict();
  var CoupangDirectshipCaptureItemSchema = external_exports.union([
    external_exports.object({ purchaseOrder: CoupangDirectPurchaseOrderSchema }).strict(),
    external_exports.object({ centers: external_exports.record(external_exports.string(), CoupangDirectCenterSchema) }).strict()
  ]);
  var CoupangDirectshipProgressSchema = external_exports.object({
    phase: external_exports.enum(["session", "list", "detail", "done"]),
    current: external_exports.number().int().min(0),
    total: external_exports.number().int().min(0)
  }).passthrough();
  var CoupangDirectshipResultSchema = external_exports.object({
    rowCount: external_exports.number().int().nonnegative(),
    purchaseOrders: external_exports.number().int().nonnegative(),
    lines: external_exports.number().int().nonnegative(),
    partialDetailCount: external_exports.number().int().nonnegative(),
    transports: external_exports.object({ SHIPMENT: external_exports.number().int().nonnegative(), MILKRUN: external_exports.number().int().nonnegative() }).strict()
  }).strict();
  var CoupangDirectshipConvertRequestSchema = external_exports.object({
    operationId: external_exports.string().uuid(),
    channelAccountId: external_exports.string().uuid(),
    transport: CoupangDirectTransportSchema,
    pos: external_exports.array(CoupangDirectPurchaseOrderSchema).max(4e3),
    centers: external_exports.record(external_exports.string(), CoupangDirectCenterSchema)
  }).strict();
  var SellpiaShipmentTrackingScopeSchema = external_exports.object({
    startDate: isoDay6,
    endDate: isoDay6
  }).strict().refine((value) => value.startDate <= value.endDate, "\uC2DC\uC791\uC77C\uC774 \uB05D\uC77C\uBCF4\uB2E4 \uB2A6\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  var MallOrdersCollectionModeSchema = external_exports.enum(["browser", "manual-upload"]);
  var MallOrdersSelectionModeSchema = external_exports.enum(["manual", "automatic"]);
  var MALL_ORDERS_ORDER_NUMBERS_MAX = 2e3;
  var MALL_ORDERS_SEEN_ROW_KEYS_MAX = 8e3;
  var MALL_ORDERS_SEEN_ROW_KEY_MAX_LENGTH = 2e3;
  var MallOrdersScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    mallKey: external_exports.string().min(1).max(64),
    collectionDate: isoDay6.nullable().default(null),
    collectionMode: MallOrdersCollectionModeSchema,
    selectionMode: MallOrdersSelectionModeSchema.optional(),
    seenRowKeys: external_exports.array(external_exports.string().min(1).max(MALL_ORDERS_SEEN_ROW_KEY_MAX_LENGTH)).max(MALL_ORDERS_SEEN_ROW_KEYS_MAX).optional()
  }).strict();
  var MALL_ORDER_OPERATION_MALLS = ["icecream-mall", "kidkids", "art09", "domeggook"];
  function isMallOrderOperationMall(mallKey) {
    return MALL_ORDER_OPERATION_MALLS.includes(mallKey);
  }
  var COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND = "shipment_dates";
  var COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND = "shipment_scan";
  var COUPANG_ROCKET_PO_CHUNK_KIND = "po_rows";
  var COUPANG_ROCKET_PO_SCAN_CHUNK_KIND = "po_scan";
  var COUPANG_DIRECTSHIP_CHUNK_KIND = "orders_capture";
  var SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND = "tracking_rows";
  var MALL_ORDERS_CHUNK_KIND = "order_rows";
  var MALL_ORDERS_CONTINUATION_CHUNK_KIND = "continuation";
  var OrdersCaptureResultSchema = external_exports.object({
    rowCount: external_exports.number().int().nonnegative()
  }).passthrough();
  var MallOrdersResultSchema = OrdersCaptureResultSchema.extend({
    mallKey: external_exports.string().min(1).max(64),
    captured: external_exports.number().int().nonnegative(),
    /**
     * 몰이 그 기간의 주문을 빠짐없이 보여 줬다는 확인(확인 범위를 내는 몰 — 도매꾹·해법몰 — 이 수집일로 걷은 성공 실행,
     * 빈 날 포함). 주문 사실 리더가 몰 적용 범위로 읽는다(옛 run의 coverageStartDate/EndDate 자리).
     */
    coverage: external_exports.object({ startDate: isoDay6, endDate: isoDay6 }).strict().optional(),
    /** 화면 표에 개인정보가 가려진 칸이 있었다(아이스크림몰) — 웹이 운영자에게 알린다. */
    masked: external_exports.boolean().optional(),
    /** 이번 수집(고른 행)의 서로 다른 주문번호, 최대 2,000개 — 웹의 생성 파일 항목(일일 건수·중복 판정)이 쓴다. */
    orderNumbers: external_exports.array(external_exports.string().min(1).max(200)).max(MALL_ORDERS_ORDER_NUMBERS_MAX).optional()
  });

  // extensions/src/collectors/orders.coupang_directship/index.ts
  var RUNTIME_PLAN_INVALID8 = "RUNTIME_PLAN_INVALID";
  var MAX_LIST_PAGES = 40;
  var WINDOW_DAYS = 30;
  var DETAIL_CONCURRENCY = 5;
  var CHUNK_ITEMS3 = 200;
  var KST_OFFSET_MS = 9 * 60 * 60 * 1e3;
  var coupangDirectshipCollector = {
    kind: COUPANG_DIRECTSHIP_KIND,
    site: "coupang-supplier",
    async *collect(rawPlan, site, { signal, report }) {
      if (!CoupangDirectshipPlanSchema.safeParse(rawPlan).success) {
        throw new RuntimeError(RUNTIME_PLAN_INVALID8, "\uC9C1\uBC30\uC1A1 \uC218\uC9D1 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: COUPANG_DIRECTSHIP_KIND });
      }
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID8, "\uC11C\uD50C\uB77C\uC774\uC5B4 \uD5C8\uBE0C \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: COUPANG_DIRECTSHIP_KIND });
      try {
        const now = Date.now();
        const query = { searchDateType: "WAREHOUSING_PLAN_DATE", from: kstDay(now, 0), to: kstDay(now, WINDOW_DAYS), status: "PA" };
        const listed = [];
        for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
          if (signal.aborted) return;
          let body;
          try {
            body = await site.purchaseOrderListPage(query, page);
          } catch (error) {
            if (page === 1 || isRuntimeError(error) && error.code === SITE_LOGIN_REQUIRED) throw error;
            break;
          }
          for (const raw of body.rows) {
            const purchaseOrder = listedPurchaseOrder(raw);
            if (purchaseOrder) listed.push(purchaseOrder);
          }
          await report?.(progress("list", page, Math.min(Number(body.lastPageNumber) || 1, MAX_LIST_PAGES)));
          if (page >= (Number(body.lastPageNumber) || 1)) break;
        }
        const buffer = new ChunkBuffer({ maxItems: CHUNK_ITEMS3, label: "\uC9C1\uBC30\uC1A1 \uBC1C\uC8FC\uC11C" });
        if (listed.length === 0) {
          yield { chunkKind: COUPANG_DIRECTSHIP_CHUNK_KIND, payload: [{ centers: {} }], progress: progress("done", 0, 0) };
          return;
        }
        const centers = await site.purchasableCenters().then(centerMap, () => ({}));
        await site.enterScmContext(String(listed[0].seq));
        let detailed = 0;
        for (let offset = 0; offset < listed.length; offset += DETAIL_CONCURRENCY) {
          if (signal.aborted) return;
          const batch = await Promise.all(listed.slice(offset, offset + DETAIL_CONCURRENCY).map(async (purchaseOrder) => {
            try {
              return { ...purchaseOrder, items: detailItems(await site.purchaseOrderDetail(String(purchaseOrder.seq))) };
            } catch (error) {
              if (isRuntimeError(error) && error.code === SITE_LOGIN_REQUIRED) throw error;
              return { ...purchaseOrder, items: [] };
            }
          }));
          detailed += batch.length;
          for (const purchaseOrder of batch) {
            const full = buffer.push({ purchaseOrder });
            if (full) yield { chunkKind: COUPANG_DIRECTSHIP_CHUNK_KIND, payload: full, progress: progress("detail", detailed, listed.length) };
          }
          await report?.(progress("detail", detailed, listed.length));
        }
        if (signal.aborted) return;
        const rest = buffer.flush();
        if (rest) yield { chunkKind: COUPANG_DIRECTSHIP_CHUNK_KIND, payload: rest, progress: progress("detail", detailed, listed.length) };
        yield { chunkKind: COUPANG_DIRECTSHIP_CHUNK_KIND, payload: [{ centers }], progress: progress("done", detailed, listed.length) };
      } finally {
        await site.close();
      }
    }
  };
  function progress(phase, current, total) {
    return { phase, current, total };
  }
  function kstDay(now, days) {
    return new Date(now + KST_OFFSET_MS + days * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
  }
  function kstYmd(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed2 = Date.parse(raw);
    if (Number.isNaN(parsed2)) return raw.slice(0, 10);
    return new Date(parsed2 + KST_OFFSET_MS).toISOString().slice(0, 10);
  }
  function isUrgent(row) {
    const code = String(row.purchaseOrderType ?? "").trim().toUpperCase();
    if (code) return code === "URGENT";
    return /긴급/.test(String(row.purchaseOrderTypeDescription ?? ""));
  }
  function listedPurchaseOrder(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw;
    const status = String(row.purchaseOrderStatus ?? row.purchaseOrderStatusCode ?? "").toUpperCase();
    const statusText = String(row.purchaseOrderStatusDescription ?? row.purchaseOrderStatusName ?? "");
    if (status && status !== "PA") return null;
    if (!status && statusText && !/발주\s*확정/.test(statusText)) return null;
    return {
      seq: String(row.purchaseOrderSeq ?? ""),
      center: String(row.centerName ?? ""),
      transport: row.transportType,
      edd: kstYmd(row.expectedDeliveryDate),
      reg: kstYmd(row.createdAt) || String(row.createdAt ?? ""),
      status: status || statusText || "PA",
      urgent: isUrgent(row),
      items: []
    };
  }
  function centerMap(value) {
    const body = value?.body ?? value;
    const list = Array.isArray(body) ? body : body?.body ?? [];
    const centers = {};
    for (const center of Array.isArray(list) ? list : []) {
      const record2 = center;
      if (!record2?.centerName) continue;
      const entry = {};
      if (typeof record2.address === "string" && record2.address.trim()) entry.addr = record2.address.trim();
      if (typeof record2.zipCode === "string" && record2.zipCode.trim() || typeof record2.zipCode === "number") {
        entry.zip = typeof record2.zipCode === "number" ? record2.zipCode : String(record2.zipCode).trim();
      }
      if (typeof record2.contact === "string" && record2.contact.trim()) entry.contact = record2.contact.trim();
      centers[String(record2.centerName).trim()] = entry;
    }
    return centers;
  }
  function detailItems(tables) {
    const num = (value) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
    for (const table of tables) {
      if (!/바코드/.test(table.text)) continue;
      const items = [];
      for (const row of table.rows) {
        const cells = row.cells.filter((cell) => !cell.header).map((cell) => cell.text.replace(/\s+/g, " ").trim());
        const match = cells[2] ? /^(\d{12,14})\s+(.+)/.exec(cells[2]) : null;
        if (match) items.push({ skuId: cells[1] ?? "", barcode: match[1], name: match[2], qty: num(cells[4]), amount: num(cells[9]) });
      }
      if (items.length) return items;
    }
    return [];
  }
  registerCollector(coupangDirectshipCollector);

  // packages/shared/src/schemas/reviews.ts
  var ReviewFilterSchema = external_exports.enum(["all", "new", "needs-response"]);
  var ReviewListItemSchema = external_exports.object({
    listingId: external_exports.string(),
    productId: external_exports.string(),
    productName: external_exports.string(),
    sku: external_exports.string().nullable(),
    organization: external_exports.string(),
    grade: external_exports.string(),
    totalReviews: external_exports.number(),
    avgRating: external_exports.number(),
    recentReviews: external_exports.number(),
    // null means the order source has not been observed for this organization.
    orderCount: external_exports.number().int().nonnegative().nullable(),
    lastReviewAt: external_exports.string().nullable()
  });
  var ReviewSummarySchema = external_exports.object({
    // 리뷰가 있는 active listing 수
    listingCount: external_exports.number().int().nonnegative(),
    // 회사 전체 누적 review 수
    totalReviewCount: external_exports.number().int().nonnegative(),
    // 회사 전체 review rating 의 가중 평균. review 가 0건이면 미측정(null).
    weightedAvgRating: external_exports.number().nonnegative().nullable(),
    // totalReviews < 5 인 listing 수.
    newListingCount: external_exports.number().int().nonnegative(),
    // avgRating < 3.5 이고 리뷰 5건 이상인 listing 수.
    needsResponseCount: external_exports.number().int().nonnegative(),
    // listing 단위로 (avgRating < 3.5) || (totalReviews < 5) 인 row 수.
    // 임계값은 frontend filter (`needs-response`/`new`) 와 일치.
    needsAttentionCount: external_exports.number().int().nonnegative()
  });
  var ReviewListResponseSchema = external_exports.object({
    items: external_exports.array(ReviewListItemSchema),
    total: external_exports.number().int().nonnegative(),
    page: external_exports.number().int().positive(),
    limit: external_exports.number().int().positive(),
    summary: ReviewSummarySchema
  });
  var ReviewItemSchema = external_exports.object({
    id: external_exports.string(),
    listingId: external_exports.string().nullable(),
    /** listing 매칭 실패 시 크롤링 당시 채널 상품명으로 폴백한다. */
    productName: external_exports.string(),
    optionName: external_exports.string().nullable(),
    rating: external_exports.number().int(),
    title: external_exports.string().nullable(),
    content: external_exports.string().nullable(),
    reviewerName: external_exports.string().nullable(),
    reviewedAt: external_exports.string(),
    imageCount: external_exports.number().int().nonnegative(),
    videoCount: external_exports.number().int().nonnegative(),
    /** 채널 상품 상세 링크용 노출상품ID. */
    externalProductId: external_exports.string().nullable()
  });
  var ReviewItemListResponseSchema = external_exports.object({
    items: external_exports.array(ReviewItemSchema),
    total: external_exports.number().int().nonnegative(),
    page: external_exports.number().int().positive(),
    limit: external_exports.number().int().positive(),
    /** 별점 1~5 별 건수. 현재 필터(별점 제외) 기준 분포. */
    ratingCounts: external_exports.record(external_exports.string(), external_exports.number().int().nonnegative()),
    /** 본문이 있는 리뷰 수. 쿠팡은 별점만 남기는 리뷰가 대부분이다. */
    withContentCount: external_exports.number().int().nonnegative()
  });
  var ReviewIngestItemSchema = external_exports.object({
    /** 쿠팡 reviewId. 재수집 멱등 키. */
    externalReviewId: external_exports.string().min(1),
    /** 쿠팡 vendorItemId(옵션ID). ChannelListingOption 매칭 키. */
    externalOptionId: external_exports.string().min(1).nullable().default(null),
    /** 쿠팡 productId(노출상품ID). */
    externalProductId: external_exports.string().min(1).nullable().default(null),
    itemName: external_exports.string().nullable().default(null),
    rating: external_exports.number().int().min(1).max(5),
    title: external_exports.string().nullable().default(null),
    content: external_exports.string().nullable().default(null),
    reviewerName: external_exports.string().nullable().default(null),
    /** 리뷰 작성 시각(epoch ms). */
    reviewedAt: external_exports.number().int().positive(),
    imageCount: external_exports.number().int().nonnegative().default(0),
    videoCount: external_exports.number().int().nonnegative().default(0),
    isDeleted: external_exports.boolean().default(false),
    isBlinded: external_exports.boolean().default(false)
  });
  var ReviewIngestRequestSchema = external_exports.object({
    platform: external_exports.literal("coupang").default("coupang"),
    items: external_exports.array(ReviewIngestItemSchema).min(1).max(200)
  });
  var ReviewIngestResponseSchema = external_exports.object({
    received: external_exports.number().int().nonnegative(),
    created: external_exports.number().int().nonnegative(),
    updated: external_exports.number().int().nonnegative(),
    /** listing 매칭에 성공한 건수. */
    linked: external_exports.number().int().nonnegative(),
    /** vendorItemId 로 ChannelListingOption 을 못 찾은 건수. */
    unlinked: external_exports.number().int().nonnegative()
  });
  var COUPANG_REVIEWS_KIND = "orders.coupang_reviews";
  var COUPANG_REVIEWS_CHUNK_KIND = "reviews";
  var COUPANG_REVIEWS_MAX_MONTHS = 36;
  var COUPANG_REVIEWS_MAX_PAGES_PER_WINDOW = 40;
  var COUPANG_REVIEWS_CHUNK_ITEMS = 200;
  var CoupangReviewsScopeSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    months: external_exports.number().int().min(1).max(COUPANG_REVIEWS_MAX_MONTHS),
    maxPagesPerWindow: external_exports.number().int().min(1).max(COUPANG_REVIEWS_MAX_PAGES_PER_WINDOW).default(COUPANG_REVIEWS_MAX_PAGES_PER_WINDOW)
  }).strict();
  var CoupangReviewsWindowSchema = external_exports.object({
    index: external_exports.number().int().nonnegative(),
    label: external_exports.string().min(1),
    start: external_exports.string().datetime({ offset: true }),
    end: external_exports.string().datetime({ offset: true })
  }).strict();
  var CoupangReviewsChunkItemSchema = ReviewIngestItemSchema.extend({
    windowIndex: external_exports.number().int().nonnegative()
  });
  var COUPANG_REVIEWS_WINDOW_CHUNK_KIND = "review_windows";
  var CoupangReviewsWindowDoneSchema = external_exports.object({
    index: external_exports.number().int().nonnegative(),
    pages: external_exports.number().int().nonnegative(),
    items: external_exports.number().int().nonnegative()
  }).strict();
  var CoupangReviewsProgressSchema = external_exports.object({
    current: external_exports.string().nullable(),
    windows: external_exports.array(external_exports.object({
      index: external_exports.number().int().nonnegative(),
      pages: external_exports.number().int().nonnegative(),
      items: external_exports.number().int().nonnegative(),
      done: external_exports.boolean()
    }).strict())
  }).strict();
  var CoupangReviewsResultSchema = external_exports.object({
    windows: external_exports.number().int().nonnegative(),
    reviews: external_exports.number().int().nonnegative(),
    inserted: external_exports.number().int().nonnegative(),
    updated: external_exports.number().int().nonnegative()
  }).strict();

  // extensions/src/collectors/orders.coupang_reviews/index.ts
  var CoupangReviewsPlanSchema = external_exports.object({
    channelAccountId: external_exports.string().uuid(),
    windows: external_exports.array(CoupangReviewsWindowSchema).min(1),
    maxPagesPerWindow: external_exports.number().int().min(1)
  });
  var COUPANG_REVIEWS_PAGE_LIMIT_REACHED = "RUNTIME_PAGE_LIMIT_REACHED";
  var RUNTIME_PLAN_INVALID9 = "RUNTIME_PLAN_INVALID";
  var coupangReviewsCollector = {
    kind: COUPANG_REVIEWS_KIND,
    site: "wing-reviews",
    async *collect(rawPlan, site, { signal }) {
      const parsed2 = CoupangReviewsPlanSchema.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID9, "\uC0C1\uD488\uD3C9 \uC218\uC9D1 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: COUPANG_REVIEWS_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID9, "Wing \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: COUPANG_REVIEWS_KIND });
      const plan = parsed2.data;
      const done = [];
      for (const window of plan.windows) {
        const status = { index: window.index, pages: 0, items: 0, done: false };
        const progress4 = (current) => ({ current, windows: [...done, { ...status }] });
        let buffer = [];
        for (let pageIndex = 0; ; pageIndex += 1) {
          if (signal.aborted) return;
          if (pageIndex >= plan.maxPagesPerWindow) {
            throw new RuntimeError(COUPANG_REVIEWS_PAGE_LIMIT_REACHED, `${window.label} \uC0C1\uD488\uD3C9\uC774 ${plan.maxPagesPerWindow}\uCABD\uC744 \uB118\uC2B5\uB2C8\uB2E4.`, {
              windowIndex: window.index
            });
          }
          const page = await site.searchReviews({ start: window.start, end: window.end, pageIndex });
          status.pages += 1;
          for (const item of page.items) {
            buffer.push({ ...item, windowIndex: window.index });
            status.items += 1;
            if (buffer.length === COUPANG_REVIEWS_CHUNK_ITEMS) {
              yield reviewsChunk(buffer, progress4(window.label));
              buffer = [];
            }
          }
          if (pageIndex + 1 >= page.totalPages) break;
        }
        if (signal.aborted) return;
        if (buffer.length > 0) yield reviewsChunk(buffer, progress4(window.label));
        status.done = true;
        done.push({ ...status });
        const last = window === plan.windows[plan.windows.length - 1];
        const marker = { index: status.index, pages: status.pages, items: status.items };
        yield { chunkKind: COUPANG_REVIEWS_WINDOW_CHUNK_KIND, payload: [marker], progress: { current: last ? null : window.label, windows: [...done] } };
      }
    }
  };
  function reviewsChunk(payload, progress4) {
    return { chunkKind: COUPANG_REVIEWS_CHUNK_KIND, payload, progress: progress4 };
  }
  registerCollector(coupangReviewsCollector);

  // extensions/src/collectors/orders.coupang_rocket_po/index.ts
  var ROCKET_PO_COLLECTION_INCOMPLETE = "ROCKET_PO_COLLECTION_INCOMPLETE";
  var RUNTIME_PLAN_INVALID10 = "RUNTIME_PLAN_INVALID";
  var DETAIL_CONCURRENCY2 = 5;
  var CHUNK_PURCHASE_ORDERS = 200;
  var coupangRocketPoCollector = {
    kind: COUPANG_ROCKET_PO_KIND,
    site: "coupang-supplier",
    async *collect(rawPlan, site, { signal, report }) {
      const parsed2 = CoupangRocketPoPlanSchema.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID10, "\uB85C\uCF13 \uBC1C\uC8FC \uC218\uC9D1 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: COUPANG_ROCKET_PO_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID10, "\uC11C\uD50C\uB77C\uC774\uC5B4 \uD5C8\uBE0C \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: COUPANG_ROCKET_PO_KIND });
      const plan = parsed2.data;
      try {
        const query = { searchDateType: plan.dateType, from: plan.from, to: plan.to, status: plan.status };
        const listed = [];
        const seen = /* @__PURE__ */ new Set();
        let totalListPages = null;
        let listPagesRead = 0;
        for (let page = 1; ; page += 1) {
          if (signal.aborted) return;
          const body = await site.purchaseOrderListPage(query, page);
          const pageCount = requiredInteger(body.lastPageNumber, "\uBC1C\uC8FC \uBAA9\uB85D \uC804\uCCB4 \uCABD \uC218");
          if (pageCount < 1 || pageCount > 1e5) throw incomplete2("\uBC1C\uC8FC \uBAA9\uB85D \uC804\uCCB4 \uCABD \uC218\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
          totalListPages ??= pageCount;
          if (totalListPages !== pageCount) throw incomplete2("\uC218\uC9D1\uD558\uB294 \uB3D9\uC548 \uBC1C\uC8FC \uBAA9\uB85D \uCABD \uC218\uAC00 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4.");
          listPagesRead = page;
          for (const raw of body.rows) {
            const po = listedPo(raw, plan.status, page);
            if (seen.has(po.poNumber)) throw incomplete2(`\uBC1C\uC8FC\uC11C ${po.poNumber}\uAC00 \uBAA9\uB85D\uC5D0 \uB450 \uBC88 \uC788\uC2B5\uB2C8\uB2E4.`);
            seen.add(po.poNumber);
            listed.push(po);
          }
          await report?.(progress2("list", page, pageCount));
          if (page >= totalListPages) break;
        }
        const vendorIds = listed.map((po) => po.vendorId);
        const vendorId2 = vendorIds.length > 0 && new Set(vendorIds).size === 1 ? vendorIds[0] : "";
        if (listed.length > 0 && !vendorId2) throw incomplete2("\uBC1C\uC8FC \uBAA9\uB85D\uC758 \uACF5\uAE09\uC790 ID\uAC00 \uBE44\uC5C8\uAC70\uB098 \uC11E\uC5EC \uC788\uC2B5\uB2C8\uB2E4.");
        const businessDateBasis = plan.dateType === "PURCHASE_ORDER_DATE" ? "ordered_at" : "expected_inbound";
        const buffer = new ChunkBuffer({ maxItems: CHUNK_PURCHASE_ORDERS, label: "\uBC1C\uC8FC\uC11C" });
        let detailed = 0;
        for (let offset = 0; offset < listed.length; offset += DETAIL_CONCURRENCY2) {
          if (signal.aborted) return;
          const batch = await Promise.all(listed.slice(offset, offset + DETAIL_CONCURRENCY2).map(async (po) => ({
            po,
            rows: await detailWithRetry(site, po, businessDateBasis)
          })));
          detailed += batch.length;
          for (const { po, rows } of batch) {
            const full = buffer.push({ poNumber: po.poNumber, rows });
            if (full) yield { chunkKind: COUPANG_ROCKET_PO_CHUNK_KIND, payload: full, progress: progress2("detail", detailed, listed.length) };
          }
          await report?.(progress2("detail", detailed, listed.length));
        }
        if (signal.aborted) return;
        const rest = buffer.flush();
        if (rest) yield { chunkKind: COUPANG_ROCKET_PO_CHUNK_KIND, payload: rest, progress: progress2("detail", detailed, listed.length) };
        const scan = {
          vendorId: vendorId2,
          listPagesRead,
          totalListPages: totalListPages ?? 0,
          detailPoCount: detailed,
          proof: { from: plan.from, to: plan.to, status: plan.status, dateType: plan.dateType, validatedList: true }
        };
        yield { chunkKind: COUPANG_ROCKET_PO_SCAN_CHUNK_KIND, payload: [scan], progress: progress2("done", detailed, listed.length) };
      } finally {
        await site.close();
      }
    }
  };
  function progress2(phase, current, total) {
    return { phase, current, total };
  }
  function listedPo(raw, status, page) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw incomplete2(`\uBC1C\uC8FC \uBAA9\uB85D ${page}\uCABD\uC5D0 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uD589\uC774 \uC788\uC2B5\uB2C8\uB2E4.`);
    const row = raw;
    const poNumber = requiredText4(row.purchaseOrderSeq, "\uBC1C\uC8FC\uC11C \uBC88\uD638");
    const purchaseOrderStatus = requiredText4(row.purchaseOrderStatus || row.purchaseOrderStatusCode, `\uBC1C\uC8FC\uC11C ${poNumber} \uC0C1\uD0DC`).toUpperCase();
    if (status && purchaseOrderStatus !== status) throw incomplete2(`\uBC1C\uC8FC\uC11C ${poNumber}\uAC00 ${status} \uC870\uD68C\uC5D0 ${purchaseOrderStatus} \uC0C1\uD0DC\uB85C \uC654\uC2B5\uB2C8\uB2E4.`);
    return {
      poNumber,
      vendorId: requiredText4(row.vendorId, `\uBC1C\uC8FC\uC11C ${poNumber} \uACF5\uAE09\uC790 ID`),
      purchaseOrderStatus,
      plannedDeliveryDate: requiredDate(row.expectedDeliveryDate, `\uBC1C\uC8FC\uC11C ${poNumber} \uC785\uACE0\uC608\uC815\uC77C`),
      listSkuCount: requiredInteger(row.skuCount, `\uBC1C\uC8FC\uC11C ${poNumber} SKU \uC218`),
      listOrderQty: requiredInteger(row.sumOfOrderQty, `\uBC1C\uC8FC\uC11C ${poNumber} \uBC1C\uC8FC \uC218\uB7C9`),
      listOrderAmount: requiredInteger(row.sumOfOrderAmount, `\uBC1C\uC8FC\uC11C ${poNumber} \uBC1C\uC8FC \uAE08\uC561`),
      centerName: row.centerName,
      transportTypeDescription: row.transportTypeDescription,
      purchaseOrderStatusDescription: row.purchaseOrderStatusDescription,
      createdAt: row.createdAt
    };
  }
  var DetailMismatch = class extends Error {
  };
  async function detailWithRetry(site, po, basis) {
    try {
      return detailRows(await site.purchaseOrderDetail(po.poNumber), po, basis);
    } catch (error) {
      if (!(error instanceof DetailMismatch)) throw error;
      try {
        return detailRows(await site.purchaseOrderDetail(po.poNumber), po, basis);
      } catch (again) {
        if (again instanceof DetailMismatch) throw incomplete2(again.message);
        throw again;
      }
    }
  }
  function detailRows(tables, po, basis) {
    const returnTable = tables.find((table) => /회송\s*담당자/.test(table.text) && /회송지/.test(table.text));
    const returnRow = returnTable?.rows[1]?.cells.map((cell) => norm(cell.text)) ?? ["", "", ""];
    const skuTable = tables.find((table) => /상품\s*번호/.test(table.text) && /발주금액/.test(table.text));
    const rows = [];
    const lineNumbers = /* @__PURE__ */ new Set();
    const products = /* @__PURE__ */ new Set();
    let orderQtyTotal = 0;
    let orderAmountTotal = 0;
    let skip = 0;
    for (const raw of skuTable?.rows ?? []) {
      if (skip > 0) {
        skip -= 1;
        continue;
      }
      const values = raw.cells.map((cell) => norm(cell.text));
      const rowSpan = Number(raw.cells[0]?.rowSpan ?? 1);
      if (!Number.isInteger(rowSpan) || rowSpan < 1) throw incomplete2(`\uBC1C\uC8FC\uC11C ${po.poNumber}\uC758 \uCCAB \uCE78 rowspan\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
      skip = rowSpan - 1;
      if (!/^\d+$/.test(values[0] ?? "")) continue;
      if (values.length <= 9) throw incomplete2(`\uBC1C\uC8FC\uC11C ${po.poNumber}\uC5D0 \uCE78\uC774 \uBAA8\uC790\uB780 SKU \uD589\uC774 \uC788\uC2B5\uB2C8\uB2E4.`);
      const lineNumber = requiredText4(values[0], `\uBC1C\uC8FC\uC11C ${po.poNumber} \uC904 \uBC88\uD638`);
      if (lineNumbers.has(lineNumber)) throw incomplete2(`\uBC1C\uC8FC\uC11C ${po.poNumber}\uC5D0 \uAC19\uC740 \uC904 \uBC88\uD638\uAC00 \uB450 \uBC88 \uC788\uC2B5\uB2C8\uB2E4.`);
      lineNumbers.add(lineNumber);
      const productNo = requiredText4(values[1], `\uBC1C\uC8FC\uC11C ${po.poNumber} \uC0C1\uD488\uBC88\uD638`);
      const productText = requiredText4(values[2], `\uBC1C\uC8FC\uC11C ${po.poNumber} \uC0C1\uD488`);
      const barcode = (/^\d{8,}/.exec(productText) ?? [""])[0];
      const productName = clean(productText, 240);
      if (!productName) throw incomplete2(`\uBC1C\uC8FC\uC11C ${po.poNumber}\uC758 \uC0C1\uD488\uBA85\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      const identity2 = `${productNo}\0${barcode}`;
      if (products.has(identity2)) throw incomplete2(`\uBC1C\uC8FC\uC11C ${po.poNumber}\uC5D0 \uAC19\uC740 \uC0C1\uD488 \uC904\uC774 \uB450 \uBC88 \uC788\uC2B5\uB2C8\uB2E4.`);
      products.add(identity2);
      const orderQty = requiredInteger(values[4], `\uBC1C\uC8FC\uC11C ${po.poNumber} \uBC1C\uC8FC \uC218\uB7C9`);
      const purchasePrice = requiredInteger(values[6], `\uBC1C\uC8FC\uC11C ${po.poNumber} \uB9E4\uC785\uAC00`);
      const supplyPrice = requiredInteger(values[7], `\uBC1C\uC8FC\uC11C ${po.poNumber} \uACF5\uAE09\uAC00`);
      const vat = requiredInteger(values[8], `\uBC1C\uC8FC\uC11C ${po.poNumber} \uBD80\uAC00\uC138`);
      const totalPurchase = requiredInteger(values[9], `\uBC1C\uC8FC\uC11C ${po.poNumber} \uBC1C\uC8FC \uAE08\uC561`);
      orderQtyTotal += orderQty;
      orderAmountTotal += totalPurchase;
      rows.push({
        poLineId: [po.poNumber, productNo, barcode, lineNumber].join(":"),
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        productNo,
        barcode,
        productName,
        orderQty,
        plannedDeliveryDate: po.plannedDeliveryDate,
        poStatusCode: po.purchaseOrderStatus,
        ...basis ? { businessDateBasis: basis } : {},
        confirmation: {
          center: clean(po.centerName, 120),
          inboundType: clean(po.transportTypeDescription, 80),
          poStatus: clean(po.purchaseOrderStatusDescription, 80),
          returnManager: clean(returnRow[0], 120),
          returnContact: clean(returnRow[1], 80),
          returnAddress: clean(returnRow[2], 300),
          purchasePrice,
          supplyPrice,
          vat,
          totalPurchase,
          poRegisteredAt: String(po.createdAt ?? "").replace("T", " ").slice(0, 19),
          xdock: "N"
        }
      });
    }
    if (!skuTable || rows.length === 0) throw new DetailMismatch(`\uBC1C\uC8FC\uC11C ${po.poNumber} \uC0C1\uC138\uC5D0 SKU \uD589\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    if (rows.length !== po.listSkuCount || orderQtyTotal !== po.listOrderQty || orderAmountTotal !== po.listOrderAmount) {
      throw new DetailMismatch(
        `\uBC1C\uC8FC\uC11C ${po.poNumber}\uC758 \uBAA9\uB85D\xB7\uC0C1\uC138 \uD569\uACC4\uAC00 \uB2E4\uB985\uB2C8\uB2E4(SKU ${rows.length}/${po.listSkuCount}, \uC218\uB7C9 ${orderQtyTotal}/${po.listOrderQty}, \uAE08\uC561 ${orderAmountTotal}/${po.listOrderAmount}).`
      );
    }
    return rows;
  }
  function incomplete2(message) {
    return new RuntimeError(ROCKET_PO_COLLECTION_INCOMPLETE, message.slice(0, 300), {});
  }
  function norm(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function clean(value, max) {
    return String(value ?? "").replace(/[\u0000-\u001F]/g, " ").replace(/^\d{8,}\s*/, "").trim().slice(0, max);
  }
  function requiredText4(value, field) {
    const text5 = norm(value);
    if (!text5) throw incomplete2(`${field}\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    return text5;
  }
  function requiredInteger(value, field) {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) throw incomplete2(`${field}\uAC00 \uC5C6\uAC70\uB098 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
      return value;
    }
    if (typeof value !== "string") throw incomplete2(`${field}\uAC00 \uC5C6\uAC70\uB098 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
    const raw = value.trim();
    if (!raw || !/^\d+$/.test(raw) && !/^\d{1,3}(?:,\d{3})+$/.test(raw)) throw incomplete2(`${field}\uAC00 \uC5C6\uAC70\uB098 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
    const parsed2 = Number(raw.replace(/,/g, ""));
    if (!Number.isSafeInteger(parsed2) || parsed2 < 0) throw incomplete2(`${field}\uAC00 \uBC94\uC704\uB97C \uBC97\uC5B4\uB0AC\uC2B5\uB2C8\uB2E4.`);
    return parsed2;
  }
  function isCalendarDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  }
  function requiredDate(value, field) {
    if (typeof value !== "string") throw incomplete2(`${field}\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
    const raw = value.trim();
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (day) {
      if (!isCalendarDate(Number(day[1]), Number(day[2]), Number(day[3]))) throw incomplete2(`${field}\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
      return raw;
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(raw);
    const parsed2 = iso ? Date.parse(raw) : Number.NaN;
    if (!iso || !isCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) || Number.isNaN(parsed2)) throw incomplete2(`${field}\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
    return new Date(parsed2 + 9 * 60 * 60 * 1e3).toISOString().slice(0, 10);
  }
  registerCollector(coupangRocketPoCollector);

  // extensions/src/collectors/orders.coupang_shipment_summary/index.ts
  var PlanSchema3 = external_exports.object({ maxPages: external_exports.number().int().min(1).max(60) });
  var PAGE_FETCH_CONCURRENCY = 6;
  var RUNTIME_PLAN_INVALID11 = "RUNTIME_PLAN_INVALID";
  var coupangShipmentSummaryCollector = {
    kind: COUPANG_SHIPMENT_SUMMARY_KIND,
    site: "coupang-supplier",
    async *collect(rawPlan, site, { signal, report }) {
      const parsed2 = PlanSchema3.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID11, "\uC27D\uBA3C\uD2B8 \uC870\uD68C \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: COUPANG_SHIPMENT_SUMMARY_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID11, "\uC11C\uD50C\uB77C\uC774\uC5B4 \uD5C8\uBE0C \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: COUPANG_SHIPMENT_SUMMARY_KIND });
      const { maxPages } = parsed2.data;
      try {
        const seen = /* @__PURE__ */ new Set();
        const byDate = /* @__PURE__ */ new Map();
        const pageRowCounts = [];
        let totalRows = 0;
        let stopReason = "max_pages";
        let reachedLastPage = false;
        for (let batchStart = 1; batchStart <= maxPages && !reachedLastPage; batchStart += PAGE_FETCH_CONCURRENCY) {
          if (signal.aborted) return;
          const batchEnd = Math.min(batchStart + PAGE_FETCH_CONCURRENCY - 1, maxPages);
          const pages = Array.from({ length: batchEnd - batchStart + 1 }, (_, index) => batchStart + index);
          const batch = await Promise.all(pages.map(async (page) => site.parcelPage(page)));
          for (const rows of batch) {
            pageRowCounts.push(rows.length);
            if (rows.length === 0) {
              stopReason = "empty_page";
              reachedLastPage = true;
              break;
            }
            for (const row of rows) {
              if (seen.has(row.seq)) continue;
              seen.add(row.seq);
              totalRows += 1;
              const date = row.outbound.slice(0, 10);
              const boxes = /(\d+)/.exec(row.boxes);
              const current = byDate.get(date) ?? { count: 0, boxes: 0 };
              current.count += 1;
              current.boxes += boxes ? Number(boxes[1]) : 0;
              byDate.set(date, current);
            }
            if (rows.length < COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS) {
              stopReason = "short_page";
              reachedLastPage = true;
              break;
            }
          }
          await report?.(progress3(pageRowCounts.length, maxPages, false));
        }
        if (signal.aborted) return;
        const buffer = new ChunkBuffer({ maxItems: 1e3, label: "\uBC1C\uC1A1\uC77C \uD56D\uBAA9" });
        const dates = [...byDate.entries()].map(([date, value]) => ({ date, count: value.count, boxes: value.boxes })).sort((a, b) => b.date.localeCompare(a.date));
        for (const item of dates) {
          const full = buffer.push(item);
          if (full) yield datesChunk(full, progress3(pageRowCounts.length, maxPages, false));
        }
        const rest = buffer.flush();
        if (rest) yield datesChunk(rest, progress3(pageRowCounts.length, maxPages, false));
        const scan = {
          maxPages,
          scannedPages: pageRowCounts.length,
          totalRows,
          stopReason,
          lastPageRowCount: pageRowCounts.at(-1) ?? 0,
          pageRowCounts,
          validatedTable: true
        };
        yield { chunkKind: COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND, payload: [scan], progress: progress3(pageRowCounts.length, maxPages, true) };
      } finally {
        await site.close();
      }
    }
  };
  function progress3(current, total, done) {
    return { current, total, done };
  }
  function datesChunk(payload, value) {
    return { chunkKind: COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND, payload, progress: value };
  }
  registerCollector(coupangShipmentSummaryCollector);

  // extensions/src/collectors/orders.mall_orders/index.ts
  var PlanSchema4 = external_exports.object({
    mallKey: external_exports.string().min(1),
    collectionDate: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    selectionMode: external_exports.enum(["manual", "automatic"]).optional(),
    seenRowKeys: external_exports.array(external_exports.string()).optional()
  });
  var CHUNK_ROWS5 = 200;
  var RUNTIME_PLAN_INVALID12 = "RUNTIME_PLAN_INVALID";
  var mallOrdersCollector = {
    kind: MALL_ORDERS_KIND,
    site: "mall-orders",
    async *collect(rawPlan, site, { signal }) {
      const parsed2 = PlanSchema4.safeParse(rawPlan);
      const reader = parsed2.success && site ? site.reader(parsed2.data.mallKey) : null;
      if (!parsed2.success || !reader) {
        throw new RuntimeError(RUNTIME_PLAN_INVALID12, "\uC774 \uD655\uC7A5\uC774 \uC218\uC9D1\uD560 \uC218 \uC5C6\uB294 \uBAB0 \uC8FC\uBB38 \uACC4\uD68D\uC785\uB2C8\uB2E4.", {
          kind: MALL_ORDERS_KIND,
          mallKey: parsed2.success ? parsed2.data.mallKey : null
        });
      }
      const plan = parsed2.data;
      try {
        const { rows, continuation } = await reader.readOrders({
          collectionDate: plan.collectionDate,
          selectionMode: plan.selectionMode ?? "manual",
          seenRowKeys: plan.seenRowKeys ?? [],
          signal
        });
        if (signal.aborted) return;
        const progress4 = { mallKey: plan.mallKey, rows: rows.length };
        const buffer = new ChunkBuffer({ maxItems: CHUNK_ROWS5, label: "\uC8FC\uBB38 \uD55C \uAC74" });
        for (const row of rows) {
          const full = buffer.push(row);
          if (full) yield { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: full, progress: progress4 };
        }
        const rest = buffer.flush();
        if (rest) yield { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: rest, progress: progress4 };
        if (continuation) yield { chunkKind: MALL_ORDERS_CONTINUATION_CHUNK_KIND, payload: [continuation], progress: progress4 };
      } finally {
        await reader.close?.();
      }
    }
  };
  registerCollector(mallOrdersCollector);

  // extensions/src/collectors/orders.sellpia_shipment_tracking/index.ts
  var PlanSchema5 = external_exports.object({
    startDate: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  });
  var CHUNK_ROWS6 = 500;
  var RUNTIME_PLAN_INVALID13 = "RUNTIME_PLAN_INVALID";
  var sellpiaShipmentTrackingCollector = {
    kind: SELLPIA_SHIPMENT_TRACKING_KIND,
    site: "sellpia",
    async *collect(rawPlan, site, { signal }) {
      const parsed2 = PlanSchema5.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID13, "\uC140\uD53C\uC544 \uC1A1\uC7A5 \uC870\uD68C \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_SHIPMENT_TRACKING_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID13, "\uC140\uD53C\uC544 \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_SHIPMENT_TRACKING_KIND });
      const { rows, total } = await site.shipmentTracking({ startDate: parsed2.data.startDate, endDate: parsed2.data.endDate });
      if (signal.aborted) return;
      const progress4 = { rows: rows.length, listed: total };
      const buffer = new ChunkBuffer({ maxItems: CHUNK_ROWS6, label: "\uC140\uD53C\uC544 \uC1A1\uC7A5 \uD55C \uC904" });
      for (const row of rows) {
        const full = buffer.push(row);
        if (full) yield { chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: full, progress: progress4 };
      }
      const rest = buffer.flush();
      if (rest) yield { chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: rest, progress: progress4 };
    }
  };
  registerCollector(sellpiaShipmentTrackingCollector);

  // extensions/src/collectors/products.sellpia_inventory/index.ts
  var PlanSchema6 = external_exports.object({
    parserVersion: external_exports.literal("sellpia-inventory-v1"),
    sourceOrigin: external_exports.literal("https://kiditem.sellpia.com"),
    sourceAccountKey: external_exports.literal("kiditem")
  }).passthrough();
  var CHUNK_ROWS7 = 5e3;
  var RUNTIME_PLAN_INVALID14 = "RUNTIME_PLAN_INVALID";
  var sellpiaInventoryCollector = {
    kind: SELLPIA_INVENTORY_KIND,
    site: "sellpia",
    async *collect(rawPlan, site, { signal }) {
      const parsed2 = PlanSchema6.safeParse(rawPlan);
      if (!parsed2.success) throw new RuntimeError(RUNTIME_PLAN_INVALID14, "\uC140\uD53C\uC544 \uC7AC\uACE0 \uC218\uC9D1 \uACC4\uD68D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_INVENTORY_KIND });
      if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID14, "\uC140\uD53C\uC544 \uC0AC\uC774\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { kind: SELLPIA_INVENTORY_KIND });
      const { rows } = await site.inventory();
      if (signal.aborted) return;
      const progress4 = { rows: rows.length };
      const buffer = new ChunkBuffer({ maxItems: CHUNK_ROWS7, label: "\uC140\uD53C\uC544 \uC0C1\uD488 \uD55C \uC904" });
      for (const item of [{ source: "sellpia_product_search", version: 1, rowCount: rows.length }, ...rows]) {
        const full = buffer.push(item);
        if (full) yield { chunkKind: SELLPIA_INVENTORY_CHUNK_KIND, payload: full, progress: progress4 };
      }
      const rest = buffer.flush();
      if (rest) yield { chunkKind: SELLPIA_INVENTORY_CHUNK_KIND, payload: rest, progress: progress4 };
    }
  };
  registerCollector(sellpiaInventoryCollector);

  // packages/shared/src/sourcing/operation-result.ts
  var BoundedCountSchema = external_exports.number().int().nonnegative().max(2147483647);
  var SourcingOperationOutcomeSchema = external_exports.enum([
    "complete",
    "partial",
    "no_change"
  ]);
  var SourcingOperationResultSchema = external_exports.object({
    outcome: SourcingOperationOutcomeSchema,
    summary: external_exports.object({
      discovered: BoundedCountSchema,
      accepted: BoundedCountSchema,
      duplicate: BoundedCountSchema,
      unchanged: BoundedCountSchema,
      failed: BoundedCountSchema
    }).strict(),
    sources: external_exports.array(
      external_exports.object({
        source: external_exports.string().trim().min(1).max(120),
        outcome: external_exports.enum([
          "complete",
          "partial",
          "no_change",
          "failed",
          "skipped"
        ]),
        accepted: BoundedCountSchema,
        failed: BoundedCountSchema,
        errorCode: external_exports.string().trim().min(1).max(120).optional()
      }).strict()
    ).max(32),
    snapshotGeneratedAt: external_exports.string().datetime({ offset: true }).optional()
  }).strict();

  // packages/shared/src/sourcing/browser-operations.ts
  var BoundedCountSchema2 = external_exports.number().int().nonnegative().max(2147483647);
  var InstantSchema = external_exports.string().datetime({ offset: true });
  var NullableBoundedTextSchema = external_exports.string().trim().max(500).nullable();
  var NullableMetricSchema = external_exports.number().finite().nonnegative().max(2147483647).nullable();
  var SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY = "coupang.keyword_suggestion";
  var SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION = "coupang-keyword-suggestion/v1";
  function canonicalizeSourcingWingCatalogKeyword(value) {
    return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  }
  function sourcingWingCatalogKeywordIdentity(value) {
    return canonicalizeSourcingWingCatalogKeyword(value).toLocaleLowerCase("en-US");
  }
  var SourcingWingCatalogKeywordSchema = external_exports.string().transform(canonicalizeSourcingWingCatalogKeyword).pipe(external_exports.string().min(1).max(100));
  var SourcingWingCatalogPurposeSchema = external_exports.enum([
    "catalog_search",
    "market_analysis",
    "recommendation_validation",
    "tracked_metrics"
  ]);
  var SourcingWingCatalogBatchInputSchema = external_exports.object({
    keywords: external_exports.array(SourcingWingCatalogKeywordSchema).min(1).max(12),
    maxPages: external_exports.number().int().min(1).max(5),
    purpose: SourcingWingCatalogPurposeSchema
  }).strict().superRefine((value, context) => {
    const identities = /* @__PURE__ */ new Set();
    value.keywords.forEach((keyword2, index) => {
      const identity2 = sourcingWingCatalogKeywordIdentity(keyword2);
      if (identities.has(identity2)) {
        context.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["keywords", index],
          message: "Wing catalog keywords must be unique after normalization."
        });
      }
      identities.add(identity2);
    });
  });
  var SourcingKeywordSuggestionInputSchema = external_exports.object({
    keyword: SourcingWingCatalogKeywordSchema,
    maxResults: external_exports.number().int().min(1).max(30)
  }).strict();
  var SourcingKeywordSuggestionItemSchema = external_exports.object({
    rank: external_exports.number().int().min(1).max(30),
    keyword: SourcingWingCatalogKeywordSchema,
    source: external_exports.enum(["coupang-autocomplete", "coupang-search-dom"])
  }).strict();
  var SourcingKeywordSuggestionTokenSchema = external_exports.object({
    keyword: SourcingWingCatalogKeywordSchema,
    count: external_exports.number().int().min(1).max(2147483647)
  }).strict();
  var SourcingKeywordSuggestionObservationBatchSchema = external_exports.object({
    keyword: SourcingWingCatalogKeywordSchema,
    capturedAt: InstantSchema,
    items: external_exports.array(SourcingKeywordSuggestionItemSchema).max(30),
    productNameTokens: external_exports.array(SourcingKeywordSuggestionTokenSchema).max(30)
  }).strict();
  var SourcingKeywordSuggestionSnapshotSchema = external_exports.object({
    keyword: SourcingWingCatalogKeywordSchema,
    generatedAt: InstantSchema.nullable(),
    sourceKey: external_exports.literal(SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY),
    schemaVersion: external_exports.literal(SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION),
    items: external_exports.array(SourcingKeywordSuggestionItemSchema).max(30),
    productNameTokens: external_exports.array(SourcingKeywordSuggestionTokenSchema).max(30)
  }).strict();
  var SourcingWingCatalogObservationSchema = external_exports.object({
    productId: external_exports.string().trim().min(1).max(200),
    itemId: external_exports.string().trim().max(200).nullable(),
    vendorItemId: external_exports.string().trim().max(200).nullable(),
    productName: external_exports.string().trim().min(1).max(500),
    itemName: NullableBoundedTextSchema,
    brandName: NullableBoundedTextSchema,
    manufacture: NullableBoundedTextSchema,
    categoryHierarchy: external_exports.string().trim().max(1e3).nullable(),
    imagePath: external_exports.string().trim().max(2e3).nullable(),
    salePriceKrw: BoundedCountSchema2.nullable(),
    ratingAverage: external_exports.number().finite().min(0).max(5).nullable(),
    ratingCount: BoundedCountSchema2.nullable(),
    viewsLast28d: BoundedCountSchema2.nullable(),
    salesLast28d: BoundedCountSchema2.nullable(),
    estimatedRevenue28d: NullableMetricSchema,
    conversionRate28d: external_exports.number().finite().min(0).max(1).nullable(),
    deliveryInfo: external_exports.string().trim().max(1e3).nullable(),
    sourceKeyword: SourcingWingCatalogKeywordSchema,
    capturedAt: InstantSchema
  }).strict();
  var SourcingWingCatalogObservationBatchSchema = external_exports.object({
    keyword: SourcingWingCatalogKeywordSchema,
    maxPages: external_exports.number().int().min(1).max(5),
    purpose: SourcingWingCatalogPurposeSchema,
    items: external_exports.array(SourcingWingCatalogObservationSchema).max(100)
  }).strict();
  var SourcingWingCatalogKeywordResultSchema = external_exports.object({
    keyword: SourcingWingCatalogKeywordSchema,
    outcome: external_exports.enum(["complete", "no_change", "failed"]),
    discovered: BoundedCountSchema2,
    accepted: BoundedCountSchema2,
    duplicate: BoundedCountSchema2,
    failed: BoundedCountSchema2,
    errorCode: external_exports.string().trim().min(1).max(120).optional()
  }).strict();
  var SourcingWingCatalogFinalizeSchema = external_exports.object({
    purpose: SourcingWingCatalogPurposeSchema,
    keywords: external_exports.array(SourcingWingCatalogKeywordResultSchema).min(1).max(12)
  }).strict();
  var SourcingWingCatalogBatchResultSchema = SourcingOperationResultSchema.extend({
    keywords: external_exports.array(SourcingWingCatalogKeywordResultSchema).min(1).max(12)
  }).strict();
  var SourcingWingCatalogSnapshotSchema = external_exports.object({
    keyword: SourcingWingCatalogKeywordSchema,
    generatedAt: InstantSchema.nullable(),
    items: external_exports.array(SourcingWingCatalogObservationSchema).max(400),
    rejectedCount: BoundedCountSchema2
  }).strict();

  // packages/shared/src/schemas/sourcing-operation.ts
  var SOURCING_OPERATION_KINDS = {
    // 확장 구동 (PR I-a)
    wingCatalog: "sourcing.wing_catalog",
    coupangKeywordSuggestion: "sourcing.coupang_keyword_suggestion",
    trend1688: "sourcing.trend_1688",
    liveCommerce: "sourcing.live_commerce",
    tiktokCreative: "sourcing.tiktok_creative",
    productExtension: "sourcing.product_extension",
    // 서버 구동 (PR I-b)
    naverTrend: "sourcing.naver_trend",
    shortstrendTrend: "sourcing.shortstrend_trend",
    taobaoLive: "sourcing.taobao_live",
    marketShadow: "sourcing.market_shadow",
    naverKeywordAnalysis: "sourcing.naver_keyword_analysis",
    keywordSearch1688: "sourcing.keyword_search_1688",
    imageSearch1688: "sourcing.image_search_1688",
    scrapeUrl: "sourcing.scrape_url"
  };
  var SOURCING_EXTENSION_KINDS = [
    SOURCING_OPERATION_KINDS.wingCatalog,
    SOURCING_OPERATION_KINDS.coupangKeywordSuggestion,
    SOURCING_OPERATION_KINDS.trend1688,
    SOURCING_OPERATION_KINDS.liveCommerce,
    SOURCING_OPERATION_KINDS.tiktokCreative,
    SOURCING_OPERATION_KINDS.productExtension
  ];
  var SourcingWingCatalogScopeSchema = SourcingWingCatalogBatchInputSchema.innerType().extend({
    channelAccountId: external_exports.string().uuid()
  }).strict();
  var SourcingTrend1688ScopeSchema = external_exports.object({}).strict();
  var SourcingLiveCommerceScopeSchema = external_exports.object({
    platform: external_exports.enum(["1688", "douyin"]),
    url: external_exports.string().url().max(500)
  }).strict();
  var SourcingTiktokCreativeScopeSchema = external_exports.object({
    maxItems: external_exports.number().int().min(1).max(100).optional(),
    region: external_exports.string().min(2).max(8).optional()
  }).strict();
  var SourcingProductExtensionScopeSchema = external_exports.object({
    platform: external_exports.enum(["1688", "alibaba"]),
    url: external_exports.string().url().max(2e3)
  }).strict();
  var SOURCING_CHUNK_KINDS = {
    /** wing_catalog: 키워드 하나의 검색 결과(원소 = 상품 행). */
    wingSearchPage: "wing_search_page",
    /** coupang_keyword_suggestion: 추천 키워드 문서 1개(청크 1장). */
    keywordSuggestions: "keyword_suggestions",
    /** trend_1688: 키워드 하나의 offer 목록. */
    offers1688: "offers_1688",
    /** live_commerce: 방송 1 + 상품들. */
    liveBroadcast: "live_broadcast",
    liveProducts: "live_products",
    /** tiktok_creative: 대상별 트렌드 항목. */
    creativeTrends: "creative_trends",
    /** product_extension: 상품 1개 원본 문서. */
    productDocument: "product_document"
  };
  var SourcingOperationResultSchema2 = external_exports.object({
    sourceKey: external_exports.string(),
    scopeKey: external_exports.string(),
    targetKey: external_exports.string(),
    discoveredCount: external_exports.number().int().nonnegative(),
    acceptedCount: external_exports.number().int().nonnegative(),
    duplicateCount: external_exports.number().int().nonnegative(),
    rejectedCount: external_exports.number().int().nonnegative(),
    coverage: external_exports.object({ numerator: external_exports.number().int().nonnegative(), denominator: external_exports.number().int().positive() }).nullable(),
    /** 발행의 원천 관측 창(timestamptz ISO). 진실은 발행 이력 표이고 이것은 화면용 요약이다. */
    windowStartAt: external_exports.string().datetime({ offset: true }).nullable(),
    windowEndAt: external_exports.string().datetime({ offset: true }).nullable(),
    /** product_extension: 이 수집이 입장시킨 원본 기록과 그 초안. */
    admitted: external_exports.array(external_exports.object({ sourceRecordId: external_exports.string().uuid(), salesProductId: external_exports.string().uuid() }).strict()).optional()
  }).strict();

  // extensions/src/collectors/sourcing.coupang_keyword_suggestion/index.ts
  var sourcingCoupangKeywordSuggestionCollector = {
    kind: SOURCING_OPERATION_KINDS.coupangKeywordSuggestion,
    site: "coupang-search",
    async *collect(plan, site, { signal }) {
      if (signal.aborted) return;
      const suggestions = await site.keywordSuggestions(plan.keyword, plan.maxResults);
      if (signal.aborted) return;
      yield {
        chunkKind: SOURCING_CHUNK_KINDS.keywordSuggestions,
        payload: [{
          keyword: plan.keyword,
          capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
          items: suggestions.items.slice(0, plan.maxResults),
          productNameTokens: suggestions.productNameTokens.slice(0, plan.maxResults),
          warnings: suggestions.warnings
        }],
        progress: { current: 1, total: 1, label: plan.keyword }
      };
    }
  };
  registerCollector(sourcingCoupangKeywordSuggestionCollector);

  // extensions/src/collectors/sourcing.live_commerce/index.ts
  var sourcingLiveCommerceCollector = {
    kind: SOURCING_OPERATION_KINDS.liveCommerce,
    site: "live-commerce",
    async *collect(plan, site, { signal, report }) {
      if (signal.aborted) return;
      const captured = await site.broadcast(plan.pageUrl, { onAttention: attentionReporter(report, { current: 0, total: 1, label: "\uBC29\uC1A1" }) });
      if (signal.aborted) return;
      yield {
        chunkKind: SOURCING_CHUNK_KINDS.liveBroadcast,
        payload: [{ source: captured.source, pageUrl: captured.pageUrl, broadcast: captured.broadcast }],
        progress: { current: 1, total: 1, label: "\uBC29\uC1A1" }
      };
      if (captured.products.length > 0) {
        yield { chunkKind: SOURCING_CHUNK_KINDS.liveProducts, payload: captured.products, progress: { products: captured.products.length } };
      }
    }
  };
  registerCollector(sourcingLiveCommerceCollector);

  // extensions/src/collectors/sourcing.product_extension/index.ts
  var sourcingProductExtensionCollector = {
    kind: SOURCING_OPERATION_KINDS.productExtension,
    site: "product-page",
    async *collect(plan, site, { signal }) {
      if (signal.aborted) return;
      const document = await site.extract(plan.sourceUrl);
      if (signal.aborted) return;
      yield { chunkKind: SOURCING_CHUNK_KINDS.productDocument, payload: [document], progress: { current: 1, total: 1, label: "\uC0C1\uD488" } };
    }
  };
  registerCollector(sourcingProductExtensionCollector);

  // extensions/src/collectors/sourcing.tiktok_creative/index.ts
  var FALLBACK_REGION = "US";
  var sourcingTiktokCreativeCollector = {
    kind: SOURCING_OPERATION_KINDS.tiktokCreative,
    site: "tiktok",
    async *collect(plan, site, { signal, report }) {
      const visits = [];
      const seen = /* @__PURE__ */ new Set();
      let region = plan.regionOverride;
      let total = 0;
      try {
        for (const targetId of plan.targetIds) {
          if (signal.aborted) return;
          const captured = await site.target(site.targetFor(targetId), region, {
            onAttention: attentionReporter(report, { current: visits.length, total: plan.targetIds.length, label: targetId })
          });
          region ??= captured.region;
          const items = [];
          for (const item of captured.items) {
            if (total >= plan.maxItems) break;
            if (!item.trendType || !item.entityKey) continue;
            const key = `${String(item.trendType)}::${String(item.entityKey)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push(item);
            total += 1;
          }
          visits.push({ targetId, items });
          if (total >= plan.maxItems) break;
        }
      } finally {
        await site.close();
      }
      for (const [index, visit] of visits.entries()) {
        yield {
          chunkKind: SOURCING_CHUNK_KINDS.creativeTrends,
          payload: [{ targetId: visit.targetId, region: region ?? FALLBACK_REGION, items: visit.items }],
          progress: { current: index + 1, total: visits.length, label: visit.targetId }
        };
      }
    }
  };
  registerCollector(sourcingTiktokCreativeCollector);

  // extensions/src/collectors/sourcing.trend_1688/index.ts
  var sourcingTrend1688Collector = {
    kind: SOURCING_OPERATION_KINDS.trend1688,
    site: "ali1688",
    async *collect(plan, site, { signal, report }) {
      try {
        for (const [index, keyword2] of plan.keywords.entries()) {
          if (signal.aborted) return;
          const items = await site.offers(keyword2, { onAttention: attentionReporter(report, { current: index, total: plan.keywords.length, label: keyword2 }) });
          yield {
            chunkKind: SOURCING_CHUNK_KINDS.offers1688,
            payload: [{ keyword: keyword2, items }],
            progress: { current: index + 1, total: plan.keywords.length, label: keyword2 }
          };
        }
      } finally {
        await site.close();
      }
    }
  };
  registerCollector(sourcingTrend1688Collector);

  // extensions/src/collectors/sourcing.wing_catalog/index.ts
  var MAX_ITEMS_PER_KEYWORD = 100;
  var SOURCING_COLLECTION_INCOMPLETE = "SOURCING_COLLECTION_INCOMPLETE";
  var sourcingWingCatalogCollector = {
    kind: SOURCING_OPERATION_KINDS.wingCatalog,
    site: "wing-search",
    async *collect(plan, site, { signal }) {
      for (const [index, keyword2] of plan.keywords.entries()) {
        if (signal.aborted) return;
        const rows = /* @__PURE__ */ new Map();
        let searchPage = 0;
        for (let pageIndex = 0; pageIndex < plan.maxPages; pageIndex += 1) {
          if (signal.aborted) return;
          const page = await site.searchPage(keyword2, searchPage);
          for (const row of page.rows) {
            const key = site.identity(row);
            if (!rows.has(key)) rows.set(key, row);
          }
          if (page.rows.length === 0 || page.nextSearchPage === null) break;
          if (page.nextSearchPage === searchPage) {
            if (pageIndex + 1 < plan.maxPages) {
              throw new RuntimeError(SOURCING_COLLECTION_INCOMPLETE, `Wing \uAC80\uC0C9 '${keyword2}'\uC758 \uB2E4\uC74C \uCABD\uC774 \uB118\uC5B4\uAC00\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.`, { keyword: keyword2 });
            }
            break;
          }
          searchPage = page.nextSearchPage;
        }
        const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
        const items = [...rows.values()].map((row) => site.toObservation(row, keyword2, capturedAt)).filter((item) => item !== null).slice(0, MAX_ITEMS_PER_KEYWORD);
        yield {
          chunkKind: SOURCING_CHUNK_KINDS.wingSearchPage,
          payload: [{ keyword: keyword2, maxPages: plan.maxPages, purpose: plan.purpose, items }],
          progress: { current: index + 1, total: plan.keywords.length, label: keyword2 }
        };
      }
    }
  };
  registerCollector(sourcingWingCatalogCollector);

  // extensions/src/collectors/test.echo/index.ts
  var CHUNKS = 2;
  var ITEMS_PER_CHUNK = 3;
  var testEchoCollector = {
    kind: "test.echo",
    site: null,
    async *collect(_plan, _site, { signal }) {
      for (let chunk = 1; chunk <= CHUNKS; chunk += 1) {
        if (signal.aborted) return;
        const at = (/* @__PURE__ */ new Date()).toISOString();
        const payload = Array.from({ length: ITEMS_PER_CHUNK }, (_, index) => ({ i: (chunk - 1) * ITEMS_PER_CHUNK + index + 1, at }));
        yield { chunkKind: "echo", payload, progress: { done: chunk } };
      }
    },
    summarize: () => ({ result: { echo: true } })
  };
  registerCollector(testEchoCollector);

  // extensions/src/sites/tab-page.ts
  function checkPageUrl(guard, value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new RuntimeError(SITE_REQUEST_FAILED, "\uC218\uC9D1 \uD0ED\uC758 \uC8FC\uC18C\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { status: null, reason: "unexpected_url", url: value });
    }
    if (guard.isLogin(url)) throw new RuntimeError(SITE_LOGIN_REQUIRED, guard.loginMessage, { url: value });
    if (!guard.allows(url)) {
      throw new RuntimeError(
        SITE_REQUEST_FAILED,
        "\uC218\uC9D1 \uD0ED\uC774 \uC608\uC0C1\uD558\uC9C0 \uBABB\uD55C \uC8FC\uC18C\uB85C \uC62E\uACA8 \uAC14\uC2B5\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uD0ED\uC744 \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.",
        { status: null, reason: "unexpected_url", url: value }
      );
    }
  }
  function leftForOperator(error) {
    return isRuntimeError(error) && (error.code === SITE_LOGIN_REQUIRED || error.details?.reason === "unexpected_url");
  }
  function hostWithin(url, domains) {
    const host = url.hostname.toLowerCase();
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }
  var SITE_TAB_UNAVAILABLE = "SITE_TAB_UNAVAILABLE";
  var OPERATOR_POLL_MS = 2e3;
  var OPERATOR_WAIT_MAX_MS = 10 * 6e4;
  var OPERATOR_REMIND_MS = 3 * 6e4;
  async function waitForOperator(page, blocked, attention, onAttention) {
    await onAttention?.(attention);
    const cleared = await page.waitWhile(blocked, { onRemind: () => onAttention?.(attention) });
    if (cleared) await onAttention?.(null);
    return cleared;
  }
  var POLL_MS = 250;
  var MISSING_RECEIVER = /(?:receiving end|could not establish|message port|no listener)/i;
  function createTabPages(deps) {
    function page(tabId, owned) {
      let closed = false;
      async function send(message, timeoutMs, frameId) {
        let timer;
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), timeoutMs);
        });
        const answer = (frameId === void 0 ? deps.chrome.tabs.sendMessage(tabId, message) : deps.chrome.tabs.sendMessage(tabId, message, { frameId })).then(
          (response) => response ?? { ok: false, error: "empty_response" },
          (error) => ({ ok: false, error: MISSING_RECEIVER.test(String(error?.message ?? error)) ? "content_script_missing" : String(error?.message ?? error) })
        );
        try {
          return await Promise.race([answer, timeout]);
        } finally {
          clearTimeout(timer);
        }
      }
      return {
        tabId,
        async navigate(url, { timeoutMs, stopAt, continueOnTimeout = false }) {
          await deps.chrome.tabs.update(tabId, { url });
          const deadline = deps.now() + timeoutMs;
          let last = url;
          await deps.sleep(POLL_MS);
          for (; ; ) {
            const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
            if (!tab) throw new RuntimeError(SITE_TAB_UNAVAILABLE, "\uC218\uC9D1 \uD0ED\uC774 \uB2EB\uD614\uC2B5\uB2C8\uB2E4.", { tabId });
            last = tab.url || last;
            if (stopAt?.(last) || tab.status === "complete") return last;
            if (deps.now() >= deadline) {
              if (continueOnTimeout) return last;
              throw new RuntimeError(SITE_TAB_UNAVAILABLE, "\uD398\uC774\uC9C0\uB97C \uC5EC\uB294 \uB370 \uC2DC\uAC04\uC774 \uB108\uBB34 \uC624\uB798 \uAC78\uB9BD\uB2C8\uB2E4.", { url });
            }
            await deps.sleep(POLL_MS);
          }
        },
        async waitWhile(blocked, { onRemind }) {
          const started = deps.now();
          let remindedAt = started;
          for (; ; ) {
            const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
            if (!tab) throw new RuntimeError(SITE_TAB_UNAVAILABLE, "\uC218\uC9D1 \uD0ED\uC774 \uB2EB\uD614\uC2B5\uB2C8\uB2E4.", { tabId });
            if (!blocked(tab.url ?? "")) return true;
            if (deps.now() - started >= OPERATOR_WAIT_MAX_MS) return false;
            if (deps.now() - remindedAt >= OPERATOR_REMIND_MS) {
              remindedAt = deps.now();
              await onRemind?.();
            }
            await deps.sleep(OPERATOR_POLL_MS);
          }
        },
        async currentUrl() {
          const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
          if (!tab?.url) throw new RuntimeError(SITE_TAB_UNAVAILABLE, "\uC218\uC9D1\uD560 \uD0ED\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { tabId });
          return tab.url;
        },
        async ask(message, { timeoutMs, inject, guard, frameId }) {
          const checkHere = async () => {
            if (!guard) return;
            const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
            if (!tab) throw new RuntimeError(SITE_TAB_UNAVAILABLE, "\uC218\uC9D1 \uD0ED\uC774 \uB2EB\uD614\uC2B5\uB2C8\uB2E4.", { tabId });
            checkPageUrl(guard, tab.url ?? "");
          };
          await checkHere();
          const first = await send(message, timeoutMs, frameId);
          if (!inject || !isMissing(first)) return first;
          await checkHere();
          const target = frameId === void 0 ? { tabId } : { tabId, frameIds: [frameId] };
          await deps.chrome.scripting.executeScript({ target, files: [...inject.isolated] });
          if (inject.main?.length) {
            await deps.sleep(300);
            await deps.chrome.scripting.executeScript({ target, files: [...inject.main], world: "MAIN" });
          }
          await deps.sleep(500);
          return send(message, timeoutMs, frameId);
        },
        async frames(files) {
          const injected = await deps.chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [...files] });
          return (Array.isArray(injected) ? injected : []).filter((item) => typeof item?.frameId === "number" && item.result !== void 0 && item.result !== null).map((item) => ({ frameId: item.frameId, result: item.result }));
        },
        listen(listener) {
          const handler = (message, sender) => {
            if (sender.tab?.id !== tabId || !message || typeof message !== "object") return;
            listener(message);
          };
          deps.chrome.runtime.onMessage.addListener(handler);
          return () => deps.chrome.runtime.onMessage.removeListener(handler);
        },
        async close() {
          if (!owned || closed) return;
          closed = true;
          await deps.chrome.tabs.remove(tabId).catch(() => void 0);
        }
      };
    }
    return {
      async open(url) {
        const created = await deps.chrome.tabs.create({ url, active: false });
        if (typeof created.id !== "number") throw new RuntimeError(SITE_TAB_UNAVAILABLE, "\uC218\uC9D1 \uD0ED\uC744 \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { url });
        return page(created.id, true);
      },
      attach: (tabId) => page(tabId, false),
      async fetchText(url, init) {
        try {
          const response = await deps.fetch(url, { credentials: "include", redirect: "error", ...init });
          return response.ok ? await response.text() : null;
        } catch {
          return null;
        }
      }
    };
  }
  function isMissing(value) {
    return typeof value === "object" && value !== null && value.error === "content_script_missing";
  }

  // extensions/src/sites/registry.ts
  var sites = /* @__PURE__ */ new Map();
  function registerSite(factory) {
    if (sites.has(factory.name)) throw new Error(`duplicate site: ${factory.name}`);
    sites.set(factory.name, factory);
  }
  function siteFactoryFor(name) {
    return sites.get(name) ?? null;
  }
  function registeredSites() {
    return [...sites.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }

  // extensions/src/sites/1688/index.ts
  var SEARCH_ORIGIN = "https://s.1688.com";
  var NAVIGATION_TIMEOUT_MS = 3e4;
  var EXTRACTION_TIMEOUT_MS = 2e4;
  var MAX_RESULTS_PER_KEYWORD = 20;
  var MAX_VERIFICATION_ROUNDS = 5;
  var ALIBABA_CONTENT_FILES = {
    isolated: [
      "content/sourcing/extractors/common.js",
      "content/sourcing/extractors/alibaba.js",
      "content/sourcing/extractors/1688.js",
      "content/sourcing/content.js"
    ]
  };
  var SITE_VERIFICATION_REQUIRED = "SITE_VERIFICATION_REQUIRED";
  var ALIBABA_1688_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["1688.com"]),
    isLogin: (url) => hostWithin(url, ["login.taobao.com", "login.1688.com", "passport.1688.com", "passport.taobao.com"]),
    loginMessage: "1688 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 1688 \uD0ED\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694."
  };
  var ALIBABA_1688_SITE = {
    name: "ali1688",
    origin: SEARCH_ORIGIN,
    caller: { minIntervalMs: 0, displayName: "1688" }
  };
  function build1688SearchUrl(keyword2) {
    return `${SEARCH_ORIGIN}/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword2)}&charset=utf8`;
  }
  function is1688VerificationUrl(value) {
    try {
      const url = new URL(value);
      return url.pathname.includes("/punish") || url.pathname.includes("/_____tmd_____/") || url.searchParams.get("action") === "captcha";
    } catch {
      return false;
    }
  }
  function create1688SearchSite(tabs) {
    let page = null;
    let keepOpen = false;
    return {
      /**
       * 키워드 하나. 슬라이더 검증이 뜨면 실패하지 않고 운영자를 기다렸다가(`onAttention`으로 알림) 같은 키워드를 다시
       * 시도한다 — 실행과 이미 올린 청크는 그대로다(KID-355 QA). 10분 안에 통과하지 않으면 `SITE_VERIFICATION_REQUIRED`.
       */
      async offers(keyword2, options = {}) {
        page ??= await tabs.open("about:blank");
        const current = page;
        const attention = { kind: "verification", site: "1688", label: keyword2 };
        const waitOrFail = async (url) => {
          if (await waitForOperator(current, is1688VerificationUrl, attention, options.onAttention)) return;
          throw verification(url, keyword2, () => {
            keepOpen = true;
          });
        };
        for (let round = 1; ; round += 1) {
          const landed = await current.navigate(build1688SearchUrl(keyword2), { timeoutMs: NAVIGATION_TIMEOUT_MS, stopAt: is1688VerificationUrl, continueOnTimeout: true });
          if (is1688VerificationUrl(landed)) {
            if (round > MAX_VERIFICATION_ROUNDS) throw verification(landed, keyword2, () => {
              keepOpen = true;
            });
            await waitOrFail(landed);
            continue;
          }
          let extracted;
          try {
            extracted = await current.ask(
              { type: "TRIGGER_1688_TREND_EXTRACT", maxResults: MAX_RESULTS_PER_KEYWORD },
              { timeoutMs: EXTRACTION_TIMEOUT_MS, inject: ALIBABA_CONTENT_FILES, guard: ALIBABA_1688_PAGE_GUARD }
            );
          } catch (error) {
            if (leftForOperator(error)) keepOpen = true;
            throw error;
          }
          if (extracted.status === "verification_required") {
            const here = await current.currentUrl().catch(() => extracted.verificationUrl ?? landed);
            if (round > MAX_VERIFICATION_ROUNDS || !is1688VerificationUrl(here)) {
              throw verification(extracted.verificationUrl ?? landed, keyword2, () => {
                keepOpen = true;
              });
            }
            await waitOrFail(here);
            continue;
          }
          if (!extracted.ok) {
            throw new RuntimeError(SITE_REQUEST_FAILED, `1688 \uAC80\uC0C9 '${keyword2}' \uACB0\uACFC\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${extracted.error ?? "\uC54C \uC218 \uC5C6\uC74C"}`, { status: null, keyword: keyword2 });
          }
          return (Array.isArray(extracted.items) ? extracted.items : []).filter((item) => typeof item?.offerId === "string" && item.offerId.length > 0).slice(0, MAX_RESULTS_PER_KEYWORD);
        }
      },
      /** 수집이 끝나면 탭을 닫는다. 검증 화면에서 멈췄으면 운영자가 풀 수 있게 남긴다. */
      async close() {
        if (page && !keepOpen) await page.close();
        page = null;
      }
    };
  }
  function verification(url, keyword2, keep) {
    keep();
    return new RuntimeError(SITE_VERIFICATION_REQUIRED, "1688\uC774 \uC2AC\uB77C\uC774\uB354 \uAC80\uC99D\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 1688 \uD0ED\uC5D0\uC11C \uAC80\uC99D\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url, keyword: keyword2 });
  }
  registerSite({ name: ALIBABA_1688_SITE.name, create: (deps) => create1688SearchSite(deps.tabs) });

  // extensions/src/sites/fresh-tab.ts
  var NAVIGATION_TIMEOUT_MS2 = 3e4;
  async function withFreshTab(tabs, url, read, options = {}) {
    const page = await tabs.open("about:blank");
    let keepOpen = false;
    try {
      await page.navigate(url, { timeoutMs: options.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS2 });
      return await (options.signIn ? options.signIn.onPage(page, url, () => read(page)) : read(page));
    } catch (error) {
      if (leftForOperator(error)) keepOpen = true;
      throw error;
    } finally {
      if (!keepOpen) await page.close();
    }
  }

  // extensions/src/sites/page-call.ts
  var PAGE_CALL_BRIDGE_FILE = "content/page-call/bridge.js";
  var PAGE_CALL_RUNNER_FILE = "content/page-call/runner.js";
  var PAGE_CALL_MESSAGE = "KIDITEM_PAGE_CALL";
  async function callPage(page, call2, args, options) {
    const answer = await page.ask(
      { type: PAGE_CALL_MESSAGE, call: call2, args, ...options.isolatedOnly ? { world: "isolated" } : {} },
      {
        timeoutMs: options.timeoutMs,
        guard: options.guard,
        ...options.frameId !== void 0 ? { frameId: options.frameId } : {},
        inject: {
          isolated: [PAGE_CALL_BRIDGE_FILE, ...options.isolated ?? []],
          // MAIN world 처리기가 있을 때만 러너를 넣는다(ISOLATED 처리기는 브리지가 바로 부른다).
          ...options.main?.length ? { main: [PAGE_CALL_RUNNER_FILE, ...options.main] } : {}
        }
      }
    );
    if (answer.ok === true) return answer.value;
    if (answer.error === "timeout") {
      throw new RuntimeError(SITE_REQUEST_FAILED, `${options.displayName} \uD654\uBA74\uC774 \uC81C\uB54C \uC751\uB2F5\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.`, { status: null, reason: "timeout", call: call2 });
    }
    throw new RuntimeError(SITE_REQUEST_FAILED, `${options.displayName} \uD654\uBA74\uC5D0\uC11C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${answer.error ?? "\uC54C \uC218 \uC5C6\uC74C"}`, {
      status: null,
      reason: "page_error",
      call: call2
    });
  }

  // extensions/src/sites/site-login.ts
  var LOGIN_FILL_FILE = "content/page-call/login-fill.js";
  var LOGIN_DIALOGS_FILE = "content/page-call/login-dialogs.js";
  var LOGIN_FILL_WINDOW_MS = 15e3;
  var FILL_RETRY_MS = 500;
  var AFTER_SUBMIT_MS = 1500;
  var AFTER_REDIRECT_MS = 1200;
  var NAVIGATION_TIMEOUT_MS3 = 3e4;
  var CALL_TIMEOUT_MS = 5e3;
  var REMAIN_CHECKS = 3;
  var REMAIN_CHECK_GAP_MS = 1500;
  var NO_ANSWER = /* @__PURE__ */ Symbol("no-answer");
  async function ensureLoggedIn(page, spec, credentials, deps, options = {}) {
    const guard = loginGuard(spec);
    const values = Object.fromEntries(spec.fields.map((field) => [field, credentials[field] ?? null]));
    if (isVerification(spec, await safeUrl(page))) return { status: "verification_required" };
    const first = await loginFrame(page);
    if (first === null && !isLogin(spec, await safeUrl(page))) {
      await page.navigate(spec.loginUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS3, continueOnTimeout: true });
    }
    const deadline = deps.now() + (options.timeoutMs ?? LOGIN_FILL_WINDOW_MS);
    const watching = /* @__PURE__ */ new Set();
    let noFormSince = null;
    while (deps.now() < deadline) {
      const url = await safeUrl(page);
      if (isVerification(spec, url)) return { status: "verification_required" };
      const frameId = await loginFrame(page);
      if (frameId === null) {
        if (isLogin(spec, url)) noFormSince = null;
        else {
          noFormSince ??= deps.now();
          if (deps.now() - noFormSince >= (spec.settleMs ?? 0)) return { status: "no_form" };
        }
      } else if (frameId !== void 0) {
        noFormSince = null;
        if (!watching.has(frameId)) {
          watching.add(frameId);
          await pageCall(page, "login.watchDialogs", {}, guard, spec, frameId, "main");
        }
        const filled = await pageCall(page, "login.fill", { values }, guard, spec, frameId, "isolated");
        if (filled?.state === "submitted") return afterSubmit(page, spec, guard, frameId, deps);
      }
      await deps.sleep(FILL_RETRY_MS);
    }
    return { status: "unconfirmed" };
  }
  async function afterSubmit(page, spec, guard, frameId, deps) {
    await deps.sleep(AFTER_SUBMIT_MS);
    await deps.sleep(AFTER_REDIRECT_MS);
    const dialogs = await pageCall(page, "login.takeDialogs", {}, guard, spec, frameId, "main");
    const mallMessage = (Array.isArray(dialogs) ? dialogs : []).map((message) => String(message).replace(/\s+/g, " ").trim()).find(Boolean);
    const withMessage = mallMessage ? { mallMessage: mallMessage.slice(0, 300) } : {};
    if (isVerification(spec, await safeUrl(page))) return { status: "verification_required", ...withMessage };
    return await formRemains(page, deps) ? { status: "form_remains", ...withMessage } : { status: "ok", ...withMessage };
  }
  async function formRemains(page, deps) {
    let lastSeen = false;
    for (let check = 0; check < REMAIN_CHECKS; check += 1) {
      if (check > 0) await deps.sleep(REMAIN_CHECK_GAP_MS);
      const probed = await probe(page);
      if (probed === NO_ANSWER) return true;
      if (probed === null || probed.length === 0) continue;
      lastSeen = probed.some((frame) => frame.result?.loginForm === true);
      if (!lastSeen) return false;
    }
    return lastSeen;
  }
  async function loginFrame(page) {
    const probed = await probe(page);
    if (probed === NO_ANSWER || probed === null || probed.length === 0) return void 0;
    const found = probed.filter((frame) => frame.result?.loginForm === true).sort((a, b) => a.frameId - b.frameId)[0];
    return found ? found.frameId : null;
  }
  async function probe(page) {
    try {
      return await within(page.frames([LOGIN_FILL_FILE]), CALL_TIMEOUT_MS);
    } catch {
      return null;
    }
  }
  async function pageCall(page, call2, args, guard, spec, frameId, world) {
    try {
      return await callPage(page, call2, args, {
        timeoutMs: CALL_TIMEOUT_MS,
        guard,
        displayName: spec.displayName,
        frameId,
        // 폼 채우기는 자격을 싣는다 — ISOLATED 처리기에서만 돌고 MAIN(페이지)으로 넘기지 않는다(리뷰 S2).
        ...world === "main" ? { main: [LOGIN_DIALOGS_FILE] } : { isolated: [LOGIN_FILL_FILE], isolatedOnly: true }
      });
    } catch {
      return null;
    }
  }
  function loginGuard(spec) {
    return {
      allows: (url) => hostWithin(url, spec.hosts),
      isLogin: () => false,
      loginMessage: `${spec.displayName} \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`
    };
  }
  async function safeUrl(page) {
    return page.currentUrl().catch(() => "");
  }
  function parsed(value) {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }
  function isLogin(spec, value) {
    const url = parsed(value);
    return url !== null && spec.isLoginUrl(url);
  }
  function isVerification(spec, value) {
    const url = parsed(value);
    return url !== null && spec.isVerificationUrl?.(url) === true;
  }
  function within(work, ms) {
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(NO_ANSWER), ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }
  function createSiteLoginGate(credentials) {
    let attempt = null;
    const usable = Boolean(credentials?.loginId && credentials.password);
    return async function withLogin(call2, login) {
      let blocked;
      try {
        return await call2();
      } catch (error) {
        if (!isLoginRequired(error)) throw error;
        blocked = error;
      }
      if (!usable) throw loginFailure(blocked, "no_credentials");
      attempt ??= login().catch(() => ({ status: "unconfirmed" }));
      const outcome = await attempt;
      if (outcome.status === "verification_required") throw loginFailure(blocked, "verification_required");
      try {
        return await call2();
      } catch (error) {
        if (!isLoginRequired(error)) throw error;
        throw outcome.status === "form_remains" ? loginFailure(error, "credentials_rejected", outcome.mallMessage) : loginFailure(error, "login_unconfirmed");
      }
    };
  }
  function createSiteSignIn(spec, credentials, deps) {
    const withLogin = createSiteLoginGate(credentials);
    const login = (page) => ensureLoggedIn(page, spec, credentials, deps);
    return {
      onPage: (page, returnTo, read) => withLogin(read, async () => {
        const outcome = await login(page);
        if (outcome.status !== "verification_required") await page.navigate(returnTo, { timeoutMs: NAVIGATION_TIMEOUT_MS3 });
        return outcome;
      }),
      beforeTab: (tabs, call2) => withLoginTab(withLogin, call2, () => tabs.open("about:blank"), login)
    };
  }
  async function withLoginTab(withLogin, call2, open, login) {
    let opened = null;
    try {
      const result = await withLogin(call2, async () => {
        opened = await open();
        return login(opened);
      });
      return result;
    } catch (error) {
      if (leftForOperator(error)) opened = null;
      throw error;
    } finally {
      await opened?.close();
    }
  }
  function isLoginRequired(error) {
    return isRuntimeError(error) && error.code === SITE_LOGIN_REQUIRED;
  }
  var REASON_TEXT = {
    no_credentials: "",
    credentials_rejected: " \uC800\uC7A5\uB41C \uC544\uC774\uB514\xB7\uBE44\uBC00\uBC88\uD638\uB85C \uB85C\uADF8\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4",
    verification_required: " \uBCF8\uC778 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB9B0 \uD0ED\uC5D0\uC11C \uC778\uC99D\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.",
    login_unconfirmed: " \uC800\uC7A5\uB41C \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uD588\uB294\uC9C0 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC5F4\uB9B0 \uD0ED\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694."
  };
  function loginFailure(error, reason, mallMessage) {
    const text5 = reason === "credentials_rejected" ? `${REASON_TEXT[reason]}${mallMessage ? `: ${mallMessage}` : ""}.` : REASON_TEXT[reason];
    return new RuntimeError(SITE_LOGIN_REQUIRED, `${error.message}${text5}`, {
      ...error.details ?? {},
      reason,
      ...mallMessage ? { mallMessage } : {}
    }, error);
  }

  // extensions/src/sites/mall-listings.ts
  var READ_TIMEOUT_MS = 20 * 6e4;
  var NAVIGATION_TIMEOUT_MS4 = 45e3;
  var MALL_CONTRACT_CHANGED3 = "MALL_CONTRACT_CHANGED";
  var SOURCE_SNAPSHOT_INVALID4 = "SOURCE_SNAPSHOT_INVALID";
  function readMallListings(tabs, spec, plan, signIn) {
    const login = `${spec.displayName} \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB9B0 ${spec.displayName} \uD654\uBA74\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uAC00\uC838\uC640 \uC8FC\uC138\uC694.`;
    return withFreshTab(tabs, spec.startUrl, async (page) => {
      const answer = await callPage(page, spec.call, { plan }, {
        timeoutMs: READ_TIMEOUT_MS,
        guard: spec.guard,
        isolated: [spec.file],
        displayName: spec.displayName
      });
      if (answer?.success === true) return answer.snapshot;
      const stage = answer?.stage ?? null;
      switch (answer?.errorCode) {
        case "mall_login_required":
          throw new RuntimeError(SITE_LOGIN_REQUIRED, login, { url: spec.startUrl });
        case "mall_contract_drift":
          throw new RuntimeError(MALL_CONTRACT_CHANGED3, `${spec.displayName} \uC0C1\uD488 \uBAA9\uB85D \uD615\uC2DD\uC774 \uBC14\uB00C\uC5B4 \uAC00\uC838\uC624\uAE30\uB97C \uBA48\uCDC4\uC2B5\uB2C8\uB2E4.${stage ? ` [${stage}]` : ""}`, { stage, mallKey: spec.mallKey });
        case "mall_total_changed":
          throw new RuntimeError(SOURCE_SNAPSHOT_INVALID4, `\uC77D\uB294 \uC0AC\uC774 ${spec.displayName} \uC0C1\uD488 \uBAA9\uB85D\uC774 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uAC00\uC838\uC640 \uC8FC\uC138\uC694.`, { stage: "total_changed", mallKey: spec.mallKey });
        case "mall_invalid_snapshot":
          throw new RuntimeError(SOURCE_SNAPSHOT_INVALID4, `${spec.displayName} \uC0C1\uD488 \uBAA9\uB85D\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544 \uC800\uC7A5\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.`, { stage, mallKey: spec.mallKey });
        case "mall_timeout":
          throw new RuntimeError(SITE_REQUEST_FAILED, `${spec.displayName} \uC751\uB2F5\uC774 \uB2A6\uC5B4 \uAC00\uC838\uC624\uAE30\uB97C \uBA48\uCDC4\uC2B5\uB2C8\uB2E4.`, { status: null, url: spec.startUrl, reason: "timeout", bodyHead: null });
        default:
          throw new RuntimeError(SITE_REQUEST_FAILED, `${spec.displayName} \uC0C1\uD488 \uBAA9\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { status: null, url: spec.startUrl, reason: "network", bodyHead: null });
      }
    }, { navigationTimeoutMs: NAVIGATION_TIMEOUT_MS4, ...signIn ? { signIn } : {} });
  }

  // extensions/src/sites/art09/listings.ts
  var ART09_LISTINGS_URL = "https://zzogzzog1.cafe24.com/disp/admin/shop1/product/ProductManage";
  var ART09_LISTINGS_FILE = "content/orders/art09-listings.js";
  var ART09_LISTINGS_GUARD = {
    allows: (url) => hostWithin(url, ["cafe24.com"]),
    isLogin: (url) => hostWithin(url, ["cafe24.com"]) && !/\/product\/ProductManage$/i.test(url.pathname),
    loginMessage: "\uC544\uD2B8\uACF5\uAD6C \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB9B0 \uC544\uD2B8\uACF5\uAD6C \uD654\uBA74\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uAC00\uC838\uC640 \uC8FC\uC138\uC694."
  };
  function createArt09Listings(tabs, signIn) {
    return {
      readListings: (plan) => readMallListings(tabs, {
        mallKey: "art09",
        displayName: "\uC544\uD2B8\uACF5\uAD6C",
        startUrl: ART09_LISTINGS_URL,
        file: ART09_LISTINGS_FILE,
        call: "art09.listings",
        guard: ART09_LISTINGS_GUARD
      }, plan, signIn)
    };
  }

  // extensions/src/sites/art09/index.ts
  var ART09_ORDER_URL = "https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1";
  var ART09_ORDERS_FILE = "content/orders/art09-orders.js";
  var READ_TIMEOUT_MS2 = 18e4;
  var LOGIN_MESSAGE = "\uC544\uD2B8\uACF5\uAD6C \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. zzogzzog1.cafe24.com \uC5D0 \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574\uC8FC\uC138\uC694.";
  var ART09_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["zzogzzog1.cafe24.com"]),
    isLogin: (url) => hostWithin(url, ["cafe24.com"]) && !/order_list\.php$/i.test(url.pathname),
    loginMessage: LOGIN_MESSAGE
  };
  var ART09_LOGIN = {
    displayName: "\uC544\uD2B8\uACF5\uAD6C",
    loginUrl: ART09_ORDER_URL,
    hosts: ["zzogzzog1.cafe24.com"],
    isLoginUrl: (url) => ART09_PAGE_GUARD.isLogin(url),
    fields: ["supplierLoginId", "loginId", "password"]
  };
  function createArt09Site(tabs, signIn) {
    return {
      ...createArt09Listings(tabs, signIn),
      readOrders(input) {
        return withFreshTab(tabs, ART09_ORDER_URL, async (page) => {
          const answer = await callPage(page, "art09.orders", { dateFilter: input.collectionDate ?? "" }, {
            timeoutMs: READ_TIMEOUT_MS2,
            guard: ART09_PAGE_GUARD,
            isolated: [ART09_ORDERS_FILE],
            displayName: "\uC544\uD2B8\uACF5\uAD6C"
          });
          if (answer?.status === "ok") return { rows: answer.rows };
          if (answer?.status === "login_required") throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: ART09_ORDER_URL });
          throw new RuntimeError(SITE_REQUEST_FAILED, `\uC544\uD2B8\uACF5\uAD6C \uC8FC\uBB38\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${answer?.status === "failed" ? answer.error : "\uC54C \uC218 \uC5C6\uC74C"}`, {
            status: null,
            reason: "page_error",
            url: ART09_ORDER_URL
          });
        }, signIn ? { signIn } : {});
      }
    };
  }
  registerSite({ name: "art09", create: (deps, lease) => createArt09Site(deps.tabs, createSiteSignIn(ART09_LOGIN, lease.credentials, deps)) });

  // extensions/src/sites/coupang-product/index.ts
  var ORIGIN = "https://www.coupang.com";
  var PAGE_TIMEOUT_MS = 6e4;
  var ASK_TIMEOUT_MS = 2e4;
  var RENDER_WAIT_MS = 1200;
  var PRODUCT_DELAY_MS = [900, 1500];
  var CONTENT_FILE = "content/advertising/coupang-product-seller.js";
  var SITE_VERIFICATION_REQUIRED2 = "SITE_VERIFICATION_REQUIRED";
  var COUPANG_PRODUCT_SITE = {
    name: "coupang-product",
    origin: ORIGIN,
    caller: { minIntervalMs: 0, displayName: "\uCFE0\uD321" }
  };
  var COUPANG_PRODUCT_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["coupang.com"]),
    isLogin: (url) => hostWithin(url, ["login.coupang.com"]),
    loginMessage: "\uCFE0\uD321 \uB85C\uADF8\uC778 \uD654\uBA74\uC73C\uB85C \uC62E\uACA8 \uAC14\uC2B5\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uCFE0\uD321 \uD0ED\uC744 \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694."
  };
  function isProductDetailUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "www.coupang.com" && url.port === "" && url.username === "" && /^\/vp\/products\/\d+$/.test(url.pathname);
    } catch {
      return false;
    }
  }
  function isExpectedProductUrl(actual, expected) {
    if (!isProductDetailUrl(actual) || !isProductDetailUrl(expected)) return false;
    const left = new URL(actual);
    const right = new URL(expected);
    if (left.pathname !== right.pathname) return false;
    return ["itemId", "vendorItemId"].every((name) => right.searchParams.get(name) === null || left.searchParams.get(name) === right.searchParams.get(name));
  }
  function parseSellerShopLink(value) {
    const href = typeof value?.href === "string" ? value.href.trim() : "";
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== "shop.coupang.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const vid = parts[0] === "vid";
    const sellerId2 = vid ? parts[1] : parts[0];
    if (!sellerId2 || !/^[A-Za-z0-9_-]{1,80}$/.test(sellerId2)) return null;
    const sellerName = String(value?.text ?? "").replace(/\s*판매자\s*상품\s*보러가기\s*$/i, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!sellerName || /^(판매자|쿠팡|로켓배송)$/i.test(sellerName)) return null;
    return { sellerName, sellerId: sellerId2, sellerStoreUrl: `https://shop.coupang.com${vid ? `/vid/${sellerId2}` : `/${sellerId2}`}` };
  }
  function createCoupangProductSite(tabs, deps) {
    let page = null;
    let keepOpen = false;
    let productsRead = 0;
    const ask = (current) => current.ask(
      { type: "KIDITEM_COUPANG_PRODUCT_SELLER" },
      { timeoutMs: ASK_TIMEOUT_MS, inject: { isolated: [CONTENT_FILE] }, guard: COUPANG_PRODUCT_PAGE_GUARD }
    );
    return {
      async sellerIdentity(link, options) {
        if (!isProductDetailUrl(link)) {
          throw new RuntimeError(SITE_REQUEST_FAILED, "\uC0C1\uD488 \uC0C1\uC138 \uC8FC\uC18C\uAC00 \uC544\uB2D9\uB2C8\uB2E4.", { status: null, reason: "not_product_detail", url: link });
        }
        if (productsRead > 0) {
          const [low, high] = PRODUCT_DELAY_MS;
          await deps.sleep(Math.floor(low + deps.random() * (high - low)));
        }
        productsRead += 1;
        page ??= await tabs.open("about:blank");
        const current = page;
        for (; ; ) {
          const landed = await current.navigate(link, { timeoutMs: PAGE_TIMEOUT_MS, continueOnTimeout: true });
          if (!isExpectedProductUrl(landed, link)) {
            try {
              checkPageUrl(COUPANG_PRODUCT_PAGE_GUARD, landed);
            } catch (error) {
              if (leftForOperator(error)) keepOpen = true;
              throw error;
            }
            const cleared = await waitForOperator(
              current,
              (url) => !isExpectedProductUrl(url, link) && !isProductDetailUrl(url),
              { kind: "verification", site: "\uCFE0\uD321", label: options.label },
              options.onAttention
            );
            if (!cleared) {
              keepOpen = true;
              throw new RuntimeError(SITE_VERIFICATION_REQUIRED2, "\uCFE0\uD321\uC774 \uBCF4\uC548 \uD655\uC778\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uCFE0\uD321 \uD0ED\uC5D0\uC11C \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url: landed });
            }
            continue;
          }
          await deps.sleep(RENDER_WAIT_MS);
          let answer = await ask(current).catch((error) => {
            if (leftForOperator(error)) keepOpen = true;
            throw error;
          });
          let seller = answer?.ok ? parseSellerShopLink(answer.seller) : null;
          if (!seller) {
            await deps.sleep(RENDER_WAIT_MS);
            answer = await ask(current);
            seller = answer?.ok ? parseSellerShopLink(answer.seller) : null;
          }
          return seller;
        }
      },
      /** 수집이 끝나면 탭을 닫는다. 보안 확인·로그인에서 멈췄으면 운영자가 볼 수 있게 남긴다. */
      async close() {
        if (page && !keepOpen) await page.close();
        page = null;
      }
    };
  }
  registerSite({ name: COUPANG_PRODUCT_SITE.name, create: (deps) => createCoupangProductSite(deps.tabs, { sleep: deps.sleep, random: () => Math.random() }) });

  // extensions/src/sites/coupang-shop/index.ts
  var ORIGIN2 = "https://shop.coupang.com";
  var PAGE_TIMEOUT_MS2 = 6e4;
  var CATALOG_TIMEOUT_MS = 9e4;
  var SORT_TIMEOUT_MS = 2e4;
  var RENDER_WAIT_MS2 = 1200;
  var CONTENT_FILE2 = "content/advertising/coupang-shop-catalog.js";
  var SITE_VERIFICATION_REQUIRED3 = "SITE_VERIFICATION_REQUIRED";
  var COUPANG_SHOP_SITE = {
    name: "coupang-shop",
    origin: ORIGIN2,
    caller: { minIntervalMs: 0, displayName: "\uCFE0\uD321 \uD310\uB9E4\uC790\uC0F5" }
  };
  var COUPANG_SHOP_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["coupang.com"]),
    isLogin: (url) => hostWithin(url, ["login.coupang.com"]),
    loginMessage: "\uCFE0\uD321 \uB85C\uADF8\uC778 \uD654\uBA74\uC73C\uB85C \uC62E\uACA8 \uAC14\uC2B5\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uCFE0\uD321 \uD0ED\uC744 \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694."
  };
  function isExpectedShopUrl(actual, expected) {
    try {
      const left = new URL(actual);
      const right = new URL(expected);
      return left.protocol === "https:" && left.hostname === "shop.coupang.com" && right.hostname === "shop.coupang.com" && /^\/(?:vid\/)?[A-Za-z0-9_-]+\/?$/.test(right.pathname) && left.pathname === right.pathname && left.search === right.search;
    } catch {
      return false;
    }
  }
  function createCoupangShopSite(tabs, deps) {
    let page = null;
    let keepOpen = false;
    const ask = (current, message, timeoutMs) => current.ask(message, { timeoutMs, inject: { isolated: [CONTENT_FILE2] }, guard: COUPANG_SHOP_PAGE_GUARD }).catch((error) => {
      if (leftForOperator(error)) keepOpen = true;
      throw error;
    });
    return {
      async catalog(target, productLimit, options = {}) {
        page ??= await tabs.open("about:blank");
        const current = page;
        for (; ; ) {
          const landed = await current.navigate(target.sellerStoreUrl, { timeoutMs: PAGE_TIMEOUT_MS2, continueOnTimeout: true });
          if (isExpectedShopUrl(landed, target.sellerStoreUrl)) break;
          try {
            checkPageUrl(COUPANG_SHOP_PAGE_GUARD, landed);
          } catch (error) {
            if (leftForOperator(error)) keepOpen = true;
            throw error;
          }
          const cleared = await waitForOperator(
            current,
            (url) => !isExpectedShopUrl(url, target.sellerStoreUrl),
            { kind: "verification", site: "\uCFE0\uD321", label: target.sellerName },
            options.onAttention
          );
          if (!cleared) {
            keepOpen = true;
            throw new RuntimeError(SITE_VERIFICATION_REQUIRED3, "\uCFE0\uD321\uC774 \uBCF4\uC548 \uD655\uC778\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uCFE0\uD321 \uD0ED\uC5D0\uC11C \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url: landed });
          }
        }
        await deps.sleep(RENDER_WAIT_MS2);
        const sorted = await ask(current, { type: "KIDITEM_COUPANG_SHOP_SORT_NEWEST" }, SORT_TIMEOUT_MS);
        if (sorted.clicked !== true) {
          throw new RuntimeError(SITE_REQUEST_FAILED, `'${target.sellerName}' \uD310\uB9E4\uC790\uC0F5\uC758 \uCD5C\uC2E0\uC21C \uC815\uB82C\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { status: null, sellerId: target.sellerId });
        }
        await deps.sleep(RENDER_WAIT_MS2);
        const answer = await ask(current, { type: "KIDITEM_COUPANG_SHOP_CATALOG", maxItems: productLimit }, CATALOG_TIMEOUT_MS);
        const catalog = answer.ok ? toCatalog(answer, target, productLimit) : null;
        if (!catalog) {
          throw new RuntimeError(SITE_REQUEST_FAILED, `'${target.sellerName}' \uD310\uB9E4\uC790\uC0F5 \uC0C1\uD488 \uBAA9\uB85D\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { status: null, sellerId: target.sellerId });
        }
        return catalog;
      },
      /** 수집이 끝나면 탭을 닫는다. 보안 확인·로그인에서 멈췄으면 운영자가 볼 수 있게 남긴다. */
      async close() {
        if (page && !keepOpen) await page.close();
        page = null;
      }
    };
  }
  function toCatalog(answer, target, productLimit) {
    const products = [];
    for (const raw of answer.products ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw;
      const productId2 = text2(row.productId, 200);
      const itemId = text2(row.itemId, 200);
      const vendorItemId = text2(row.vendorItemId, 200);
      const name = text2(row.name, 500);
      if (!name || !productId2 && !itemId && !vendorItemId) continue;
      products.push({
        sourceRank: products.length + 1,
        productId: productId2,
        itemId,
        vendorItemId,
        name,
        priceKrw: count(row.priceKrw),
        reviewCount: count(row.reviewCount),
        imageUrl: text2(row.imageUrl, 2e3),
        link: text2(row.link, 2e3)
      });
      if (products.length >= productLimit) break;
    }
    if (products.length === 0) return null;
    const totalProductCount = count(answer.totalProductCount);
    return {
      keyword: target.keyword,
      sellerId: target.sellerId,
      sellerName: text2(answer.sellerName, 300) ?? target.sellerName,
      sellerStoreUrl: target.sellerStoreUrl,
      totalProductCount,
      collectedProductCount: products.length,
      isTruncated: totalProductCount !== null && totalProductCount > products.length,
      sort: "newest",
      capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      products
    };
  }
  function text2(value, max) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  }
  function count(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
  }
  registerSite({ name: COUPANG_SHOP_SITE.name, create: (deps) => createCoupangShopSite(deps.tabs, { sleep: deps.sleep }) });

  // extensions/src/sites/coupang-search/parse.ts
  var PROVIDER_ATTENTION = /access\s*denied|unauthori[sz]ed|forbidden|too\s*many\s*requests|로그인|인증|접근\s*거부/i;
  var STOP_WORDS = /* @__PURE__ */ new Set(["\uCFE0\uD321", "\uB85C\uCF13", "\uB85C\uCF13\uBC30\uC1A1", "\uBB34\uB8CC\uBC30\uC1A1", "\uBB34\uB8CC", "\uBC30\uC1A1", "\uC815\uD488", "\uAD6D\uB0B4", "\uB2F9\uC77C", "\uC624\uB298", "\uC0C8\uC0C1\uD488", "\uC0C1\uD488", "\uAD6C\uB9E4", "\uD560\uC778", "\uD2B9\uAC00", "\uC635\uC158", "\uC0C9\uC0C1", "\uB79C\uB364"]);
  function parseCoupangSearchEvidence(evidence, seed, maxResults, origin = "https://www.coupang.com") {
    const warnings = [];
    const candidates = [];
    let structuredResponse = false;
    let domEvidence = false;
    let providerError = null;
    const add = (value, source) => {
      if (typeof value !== "string") return;
      const keyword2 = value.replace(/\s+/g, " ").trim();
      if (usableKeyword(keyword2, seed)) candidates.push({ keyword: keyword2, source });
    };
    const walk = (value) => {
      if (typeof value === "string") return add(value, "coupang-autocomplete");
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        if (/keyword|query|term|suggest|name|label|word/i.test(key) && typeof nested === "string") add(nested, "coupang-autocomplete");
        else walk(nested);
      }
    };
    const autocomplete = evidence.autocomplete;
    if (autocomplete?.error) warnings.push(autocomplete.error);
    if (autocomplete && autocomplete.status !== 0 && (autocomplete.status < 200 || autocomplete.status >= 300)) {
      warnings.push(`\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 \uD638\uCD9C \uC2E4\uD328 (${autocomplete.status})`);
      if ([401, 403, 429].includes(autocomplete.status)) {
        providerError = autocomplete.status === 429 ? { reason: "rate_limited", message: "\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 \uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." } : { reason: "provider_denied", message: "\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uCFE0\uD321 \uD0ED\uC5D0\uC11C \uB2E4\uC2DC \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694." };
      }
    }
    const text5 = autocomplete?.text.trim() ?? "";
    if (text5 && (autocomplete?.contentType.includes("application/json") || /^[[{]/.test(text5))) {
      try {
        const parsed2 = JSON.parse(text5);
        if (parsed2 && typeof parsed2 === "object") {
          if (isErrorEnvelope(parsed2)) {
            const message = errorEnvelopeMessage(parsed2);
            providerError ??= { reason: "provider_denied", message };
          } else {
            walk(parsed2);
            structuredResponse = hasSuggestionCollection(parsed2);
          }
        } else {
          warnings.push("\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 JSON \uAD6C\uC870\uAC00 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
        }
      } catch {
        warnings.push("\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 JSON \uD30C\uC2F1 \uC2E4\uD328");
      }
    } else if (text5) {
      warnings.push("\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 \uC751\uB2F5\uC774 JSON\uC774 \uC544\uB2D9\uB2C8\uB2E4");
    }
    const beforeDom = candidates.length;
    for (const link of evidence.links) {
      add(link.text, "coupang-search-dom");
      try {
        const parsed2 = new URL(link.href, origin);
        add(parsed2.searchParams.get("q") || parsed2.searchParams.get("keyword") || "", "coupang-search-dom");
      } catch {
      }
    }
    if (candidates.length > beforeDom) domEvidence = true;
    const productNames = [];
    for (const raw of evidence.productNames) {
      const name = raw.replace(/\s+/g, " ").trim();
      if (name.length < 4 || name.length > 180 || /장바구니|구매|광고|무료배송|로켓배송만 보기/.test(name)) continue;
      productNames.push(name);
      domEvidence = true;
    }
    if (providerError) return { ok: false, ...providerError, warnings };
    if (!structuredResponse && !domEvidence) {
      return { ok: false, reason: "no_evidence", message: "\uCFE0\uD321 \uD0A4\uC6CC\uB4DC \uC751\uB2F5\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uC218 \uC788\uB294 \uAC80\uC0C9 \uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", warnings };
    }
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    for (const candidate of candidates) {
      const key = candidate.keyword.replace(/\s+/g, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ rank: items.length + 1, keyword: candidate.keyword, source: candidate.source });
      if (items.length >= maxResults) break;
    }
    return { ok: true, items, productNameTokens: countTokens(productNames, maxResults), warnings };
  }
  function usableKeyword(value, seed) {
    if (value.length < 2 || value.length > 40) return false;
    if (/https?:\/\//i.test(value) || /^[\d\s,.-]+$/.test(value) || /[₩원%]/.test(value)) return false;
    if (["\uAC80\uC0C9", "\uBC14\uB85C\uAC00\uAE30", "\uCFE0\uD321", "\uB85C\uCF13\uBC30\uC1A1", "\uBB34\uB8CC\uBC30\uC1A1"].includes(value)) return false;
    const compact = value.replace(/\s+/g, "").toLowerCase();
    return compact.length > 1 && compact !== seed.replace(/\s+/g, "").toLowerCase();
  }
  function isErrorEnvelope(value) {
    if (Array.isArray(value)) return false;
    const record2 = value;
    if (record2.success === false || record2.ok === false) return true;
    for (const key of ["error", "errors", "errorCode", "error_code"]) {
      const nested = record2[key];
      if (key in record2 && nested !== null && nested !== void 0 && String(nested).trim()) return true;
    }
    if (record2.code !== void 0 && record2.code !== null && record2.code !== 0 && record2.code !== "0" && String(record2.code).trim() !== "") return true;
    return typeof record2.message === "string" && PROVIDER_ATTENTION.test(record2.message);
  }
  function errorEnvelopeMessage(value) {
    const record2 = value;
    for (const key of ["error", "errors", "message", "errorCode", "error_code", "code"]) {
      const nested = record2[key];
      if (nested !== null && nested !== void 0 && String(nested).trim()) return String(nested);
    }
    return "\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 \uC751\uB2F5\uC5D0\uC11C \uC624\uB958\uB97C \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4.";
  }
  function hasSuggestionCollection(value, depth = 0) {
    if (Array.isArray(value)) return true;
    if (!value || typeof value !== "object" || depth > 3) return false;
    for (const [key, nested] of Object.entries(value)) {
      if (!/suggest|keyword|query|term|result|item|product|data|list/i.test(key)) continue;
      if (Array.isArray(nested) || typeof nested === "string" && nested.trim()) return true;
      if (nested && typeof nested === "object" && hasSuggestionCollection(nested, depth + 1)) return true;
    }
    return false;
  }
  function countTokens(productNames, maxResults) {
    const counts = /* @__PURE__ */ new Map();
    for (const name of productNames) {
      const tokens = new Set(name.replace(/[()[\]{}"'`~!@#$%^&*_+=|\\:;,.<>/?·•]/g, " ").split(/\s+/).map((token) => token.trim()).filter((token) => token.length >= 2 && token.length <= 20).filter((token) => !/^[\d개입묶음세트]+$/.test(token)).filter((token) => !STOP_WORDS.has(token)));
      for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts.entries()].map(([keyword2, count3]) => ({ keyword: keyword2, count: count3 })).sort((left, right) => right.count - left.count || left.keyword.localeCompare(right.keyword, "ko")).slice(0, maxResults);
  }

  // extensions/src/sites/coupang-search/serp.ts
  var ORIGIN3 = "https://www.coupang.com";
  var PAGE_TIMEOUT_MS3 = 6e4;
  var EXTRACTION_TIMEOUT_MS2 = 2e4;
  var RENDER_WAIT_MS3 = 1200;
  var PAGE_DELAY_MS = [1500, 3e3];
  var KEYWORD_DELAY_MS = [4e3, 8e3];
  var WALL_POLL_MS = 5e3;
  var WALL_WAIT_MAX_MS = 10 * 6e4;
  var WALL_REMIND_MS = 3 * 6e4;
  var CONTENT_FILE3 = "content/advertising/coupang-serp-page.js";
  var SITE_VERIFICATION_REQUIRED4 = "SITE_VERIFICATION_REQUIRED";
  var COUPANG_SERP_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["coupang.com"]),
    isLogin: (url) => hostWithin(url, ["login.coupang.com"]),
    loginMessage: "\uCFE0\uD321 \uB85C\uADF8\uC778 \uD654\uBA74\uC73C\uB85C \uC62E\uACA8 \uAC14\uC2B5\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uCFE0\uD321 \uD0ED\uC744 \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694."
  };
  function buildCoupangSerpUrl(keyword2, page) {
    return `${ORIGIN3}/np/search?q=${encodeURIComponent(keyword2)}&channel=user&page=${page}&listSize=36`;
  }
  function isExpectedSerpUrl(actual, expected) {
    try {
      const left = new URL(actual);
      const right = new URL(expected);
      if (left.protocol !== "https:" || left.hostname !== "www.coupang.com" || left.pathname !== "/np/search") return false;
      return ["q", "channel", "page", "listSize"].every((name) => left.searchParams.get(name) === right.searchParams.get(name));
    } catch {
      return false;
    }
  }
  function createCoupangSerp(tabs, deps) {
    let page = null;
    let keepOpen = false;
    let keywordsRead = 0;
    const between = ([low, high]) => deps.sleep(Math.floor(low + deps.random() * (high - low)));
    async function read(current, url) {
      const landed = await current.navigate(url, { timeoutMs: PAGE_TIMEOUT_MS3, continueOnTimeout: true });
      if (!isExpectedSerpUrl(landed, url)) return { landed, read: null };
      await deps.sleep(RENDER_WAIT_MS3);
      try {
        const answer = await current.ask(
          { type: "KIDITEM_COUPANG_SERP_ITEMS" },
          { timeoutMs: EXTRACTION_TIMEOUT_MS2, inject: { isolated: [CONTENT_FILE3] }, guard: COUPANG_SERP_PAGE_GUARD }
        );
        return { landed, read: answer };
      } catch (error) {
        if (leftForOperator(error)) keepOpen = true;
        throw error;
      }
    }
    async function waitThroughWall(current, url, attention, onAttention) {
      const started = deps.now();
      let remindedAt = started;
      await onAttention?.(attention);
      for (; ; ) {
        if (deps.now() - started >= WALL_WAIT_MAX_MS) {
          keepOpen = true;
          throw new RuntimeError(SITE_VERIFICATION_REQUIRED4, "\uCFE0\uD321\uC774 \uBCF4\uC548 \uD655\uC778\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uCFE0\uD321 \uD0ED\uC5D0\uC11C \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { keyword: attention.label });
        }
        await deps.sleep(WALL_POLL_MS);
        if (deps.now() - remindedAt >= WALL_REMIND_MS) {
          remindedAt = deps.now();
          await onAttention?.(attention);
        }
        const here = await current.currentUrl().catch(() => "");
        const again = isExpectedSerpUrl(here, url) ? await readInPlace(current) : await read(current, url).then((result) => result.read);
        if (again && again.ok && again.wall !== "captcha") {
          await onAttention?.(null);
          return again;
        }
      }
    }
    async function readInPlace(current) {
      return current.ask(
        { type: "KIDITEM_COUPANG_SERP_ITEMS" },
        { timeoutMs: EXTRACTION_TIMEOUT_MS2, inject: { isolated: [CONTENT_FILE3] }, guard: COUPANG_SERP_PAGE_GUARD }
      ).catch(() => null);
    }
    return {
      async serp(keyword2, maxPages, options = {}) {
        if (keywordsRead > 0) await between(KEYWORD_DELAY_MS);
        keywordsRead += 1;
        page ??= await tabs.open("about:blank");
        const current = page;
        const attention = { kind: "verification", site: "\uCFE0\uD321", label: keyword2 };
        const items = [];
        let stopReason = "page_limit";
        let pagesScanned = 0;
        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
          const url = buildCoupangSerpUrl(keyword2, pageNumber);
          const first = await read(current, url);
          let answer = first.read;
          if (answer === null) failIfLeftSite(first.landed, () => {
            keepOpen = true;
          });
          if (answer === null || answer.wall === "captcha") {
            answer = await waitThroughWall(current, url, attention, options.onAttention);
          }
          if (!answer?.ok) {
            throw new RuntimeError(SITE_REQUEST_FAILED, `\uCFE0\uD321 \uAC80\uC0C9 '${keyword2}' \uACB0\uACFC\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4(${answer?.error ?? "\uC54C \uC218 \uC5C6\uC74C"}).`, { status: null, keyword: keyword2 });
          }
          const pageItems = normalizeSerpItems(answer.items ?? [], pageNumber, items.length);
          if (pageItems.length === 0) {
            if (pageNumber === 1) {
              throw new RuntimeError(SITE_REQUEST_FAILED, `\uCFE0\uD321 \uAC80\uC0C9 '${keyword2}' \uACB0\uACFC\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4 \u2014 \uC0C1\uD488 \uBAA9\uB85D\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { status: null, keyword: keyword2, reason: "empty_first_page" });
            }
            stopReason = answer.wall ? "provider_wall" : answer.resultListObserved === true ? "empty_page" : "invalid_result";
            break;
          }
          items.push(...pageItems);
          pagesScanned = pageNumber;
          if (pageNumber < maxPages) await between(PAGE_DELAY_MS);
        }
        return { pagesScanned, stopReason, items };
      },
      /** 수집이 끝나면 탭을 닫는다. 보안 확인·로그인에서 멈췄으면 운영자가 볼 수 있게 남긴다. */
      async closeSerp() {
        if (page && !keepOpen) await page.close();
        page = null;
      }
    };
  }
  function failIfLeftSite(landed, keep) {
    let url;
    try {
      url = new URL(landed);
    } catch {
      return;
    }
    if (!COUPANG_SERP_PAGE_GUARD.isLogin(url) && COUPANG_SERP_PAGE_GUARD.allows(url)) return;
    keep();
    checkPageUrl(COUPANG_SERP_PAGE_GUARD, landed);
  }
  function normalizeSerpItems(raw, page, offset) {
    const items = [];
    for (const candidate of raw) {
      if (!candidate || typeof candidate !== "object") continue;
      const row = candidate;
      const productId2 = text3(row.productId, 40);
      if (!productId2) continue;
      const position = items.length + 1;
      items.push({
        rank: offset + position,
        page,
        positionInPage: position,
        isAd: row.isAd === true,
        productId: productId2,
        itemId: text3(row.itemId, 40),
        vendorItemId: text3(row.vendorItemId, 40),
        name: text3(row.name, 300),
        priceKrw: count2(row.priceKrw),
        reviewCount: count2(row.reviewCount),
        ratingScore: typeof row.ratingScore === "number" && row.ratingScore >= 0 && row.ratingScore <= 5 ? row.ratingScore : null,
        imageUrl: text3(row.imageUrl, 2e3),
        link: text3(row.link, 2e3)
      });
    }
    return items;
  }
  function text3(value, max) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  }
  function count2(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
  }

  // extensions/src/sites/coupang-search/index.ts
  var ORIGIN4 = "https://www.coupang.com";
  var PAGE_TIMEOUT_MS4 = 6e4;
  var EVIDENCE_TIMEOUT_MS = 3e4;
  var SETTLE_MS = 1500;
  var CONTENT_FILE4 = "content/sourcing/coupang-search-page.js";
  var COUPANG_SEARCH_SITE = {
    name: "coupang-search",
    origin: ORIGIN4,
    caller: { minIntervalMs: SETTLE_MS, displayName: "\uCFE0\uD321" }
  };
  function buildCoupangSearchUrl(keyword2) {
    return `${ORIGIN4}/np/search?component=&q=${encodeURIComponent(keyword2)}&channel=user`;
  }
  function isCoupangSearchUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.toLowerCase() === "www.coupang.com" && url.port === "" && url.username === "" && url.password === "" && /^\/np\/search\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }
  function createCoupangSearchSite(tabs, deps) {
    return {
      async keywordSuggestions(keyword2, maxResults) {
        const url = buildCoupangSearchUrl(keyword2);
        const page = await tabs.open("about:blank");
        try {
          const landed = await page.navigate(url, { timeoutMs: PAGE_TIMEOUT_MS4 });
          if (!isCoupangSearchUrl(landed)) {
            throw new RuntimeError(SITE_LOGIN_REQUIRED, "\uCFE0\uD321 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uCFE0\uD321\uC5D0 \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url: landed });
          }
          await deps.sleep(SETTLE_MS);
          const evidence = await page.ask(
            { type: "KIDITEM_COUPANG_SEARCH_EVIDENCE", keyword: keyword2 },
            { timeoutMs: EVIDENCE_TIMEOUT_MS, inject: { isolated: [CONTENT_FILE4] } }
          );
          if (!evidence.links || !evidence.productNames) {
            throw new RuntimeError(SITE_REQUEST_FAILED, `\uCFE0\uD321 \uAC80\uC0C9 \uD654\uBA74\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4(${evidence.error}).`, { status: null, url });
          }
          const parsed2 = parseCoupangSearchEvidence({ autocomplete: evidence.autocomplete ?? null, links: evidence.links, productNames: evidence.productNames }, keyword2, maxResults);
          if (!parsed2.ok) {
            throw new RuntimeError(
              parsed2.reason === "provider_denied" ? SITE_LOGIN_REQUIRED : SITE_REQUEST_FAILED,
              parsed2.message,
              { status: parsed2.reason === "rate_limited" ? 429 : null, url, reason: parsed2.reason, warnings: parsed2.warnings }
            );
          }
          return { items: parsed2.items, productNameTokens: parsed2.productNameTokens, warnings: parsed2.warnings };
        } finally {
          await page.close();
        }
      }
    };
  }
  registerSite({
    name: COUPANG_SEARCH_SITE.name,
    create: (deps) => ({
      ...createCoupangSearchSite(deps.tabs, { sleep: deps.sleep }),
      ...createCoupangSerp(deps.tabs, { sleep: deps.sleep, now: deps.now, random: () => Math.random() })
    })
  });

  // extensions/src/sites/coupang-supplier/page.ts
  var COUPANG_SUPPLIER_ORIGIN = "https://supplier.coupang.com";
  var COUPANG_SUPPLIER_PAGE_FILES = { isolated: ["content/orders/coupang-supplier-page.js"] };
  var SITE_COOKIE_BLOAT = "SITE_COOKIE_BLOAT";
  var COOKIE_BLOAT_MESSAGE = "\uCFE0\uD321 \uC811\uC18D\uC774 \uB9CE\uC544 supplier.coupang.com \uCFE0\uD0A4\uAC00 \uCEE4\uC838(HTTP 400) \uC694\uCCAD\uC774 \uAC70\uBD80\uB410\uC2B5\uB2C8\uB2E4. \uCFE0\uD321 \uCFE0\uD0A4\uB97C \uC815\uB9AC\uD558\uAC70\uB098 \uB2E4\uC2DC \uB85C\uADF8\uC778\uD55C \uB4A4 \uC870\uD68C\uD558\uC138\uC694.";
  var SUPPLIER_LOGIN_MESSAGE = "\uCFE0\uD321 \uC11C\uD50C\uB77C\uC774\uC5B4 \uD5C8\uBE0C \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. supplier.coupang.com \uD0ED\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.";
  var COUPANG_SUPPLIER_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["supplier.coupang.com"]),
    isLogin: isSupplierLoginUrl,
    loginMessage: SUPPLIER_LOGIN_MESSAGE
  };
  function isSupplierLoginUrl(url) {
    return hostWithin(url, ["xauth.coupang.com"]) || /\/(?:login|sign-in|signin)(?:[/?#]|$)/i.test(url.pathname);
  }
  var COUPANG_SUPPLIER_LOGIN = {
    displayName: "\uCFE0\uD321 \uC11C\uD50C\uB77C\uC774\uC5B4 \uD5C8\uBE0C",
    loginUrl: `${COUPANG_SUPPLIER_ORIGIN}/po-web/app/purchase-order/list`,
    hosts: ["supplier.coupang.com", "xauth.coupang.com"],
    isLoginUrl: isSupplierLoginUrl,
    fields: ["loginId", "password"]
  };
  var SUPPLIER_REQUEST_TIMEOUT_MS = 6e4;
  function supplierPage(tab) {
    return {
      tab,
      async fetch(path, options = {}) {
        const answer = await tab.ask(
          { type: "KIDITEM_COUPANG_SUPPLIER_FETCH", url: path, headers: options.headers ?? {}, tables: options.tables === true },
          { timeoutMs: options.timeoutMs ?? SUPPLIER_REQUEST_TIMEOUT_MS, inject: COUPANG_SUPPLIER_PAGE_FILES, guard: COUPANG_SUPPLIER_PAGE_GUARD }
        );
        if (answer.ok !== true && /failed to fetch/i.test(answer.error ?? "")) throw loginRequired(path);
        if (answer.ok !== true || typeof answer.status !== "number" || typeof answer.text !== "string") {
          const reason = answer.error === "timeout" ? "timeout" : "network";
          throw new RuntimeError(SITE_REQUEST_FAILED, reason === "timeout" ? "\uC11C\uD50C\uB77C\uC774\uC5B4 \uD5C8\uBE0C\uAC00 \uC81C\uB54C \uC751\uB2F5\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." : "\uC11C\uD50C\uB77C\uC774\uC5B4 \uD5C8\uBE0C\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", {
            status: null,
            url: path,
            reason,
            bodyHead: answer.error ?? null
          });
        }
        return {
          status: answer.status,
          redirected: answer.redirected === true,
          url: answer.url ?? path,
          text: answer.text,
          tables: Array.isArray(answer.tables) ? answer.tables : null
        };
      },
      async bodyText() {
        const answer = await tab.ask(
          { type: "KIDITEM_COUPANG_SUPPLIER_BODY_TEXT" },
          { timeoutMs: 1e4, inject: COUPANG_SUPPLIER_PAGE_FILES }
        );
        return typeof answer.text === "string" ? answer.text : "";
      }
    };
  }
  function loginRequired(url) {
    return new RuntimeError(SITE_LOGIN_REQUIRED, SUPPLIER_LOGIN_MESSAGE, { url });
  }
  function cookieBloat(url, status) {
    return new RuntimeError(SITE_COOKIE_BLOAT, COOKIE_BLOAT_MESSAGE, { url, status });
  }
  function responseInvalid(url, message) {
    return new RuntimeError(SITE_REQUEST_FAILED, message, { status: null, url, reason: "response_invalid", bodyHead: null });
  }
  function keepTabFor(error) {
    return leftForOperator(error);
  }

  // extensions/src/sites/coupang-supplier/po.ts
  var PO_BOOTSTRAP_URL = `${COUPANG_SUPPLIER_ORIGIN}/scm/purchase/order/list`;
  var PO_READY_PATH_PREFIX = "/po-web/purchase/order";
  var NAVIGATION_TIMEOUT_MS5 = 3e4;
  function isReadyPoUrl(value) {
    try {
      const url = new URL(value);
      return url.origin === COUPANG_SUPPLIER_ORIGIN && url.pathname.startsWith(PO_READY_PATH_PREFIX);
    } catch {
      return false;
    }
  }
  async function preparePoSession(tab) {
    const page = supplierPage(tab);
    for (let attempt = 1; ; attempt += 1) {
      const landed = await tab.navigate(PO_BOOTSTRAP_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS5 });
      if (isReadyPoUrl(landed)) return page;
      const body = isSupplierUrl(landed) ? await page.bodyText().catch(() => "") : "";
      if (/HTTP Status 400|Bad Request/i.test(body)) throw cookieBloat(landed, 400);
      if (attempt >= 2) throw loginRequired(landed);
    }
  }
  function isSupplierUrl(value) {
    try {
      return new URL(value).origin === COUPANG_SUPPLIER_ORIGIN;
    } catch {
      return false;
    }
  }
  async function readPurchaseOrderListPage(page, path, pageNumber) {
    const fetched = await page.fetch(path, { headers: { accept: "application/json" } });
    const text5 = fetched.text;
    const failed6 = () => pageNumber === 1 ? loginRequired(fetched.url) : new RuntimeError(SITE_REQUEST_FAILED, `\uBC1C\uC8FC \uBAA9\uB85D ${pageNumber}\uCABD\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { status: fetched.status, url: path, reason: "http", bodyHead: null });
    if (fetched.status === 400 || fetched.status === 413 || fetched.status === 431) throw cookieBloat(path, fetched.status);
    if (fetched.status < 200 || fetched.status >= 300 || text5.trim().charAt(0) === "<") throw failed6();
    let parsed2;
    try {
      parsed2 = JSON.parse(text5);
    } catch {
      throw failed6();
    }
    const body = parsed2?.body;
    if (!body || !Array.isArray(body.body)) throw responseInvalid(path, `\uBC1C\uC8FC \uBAA9\uB85D ${pageNumber}\uCABD\uC5D0 \uD589 \uBC30\uC5F4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    return { rows: body.body, lastPageNumber: body.lastPageNumber };
  }
  function purchaseOrderDetailPath(poNumber) {
    return `/scm/purchase/order/get/${encodeURIComponent(poNumber)}`;
  }
  async function readPurchaseOrderDetail(page, poNumber) {
    const path = purchaseOrderDetailPath(poNumber);
    const fetched = await page.fetch(path, { tables: true });
    if (fetched.status < 200 || fetched.status >= 300 || !/^\s*</.test(fetched.text)) {
      throw new RuntimeError(SITE_REQUEST_FAILED, `\uBC1C\uC8FC\uC11C ${poNumber} \uC0C1\uC138\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { status: fetched.status, url: path, reason: "http", bodyHead: null });
    }
    const tables = fetched.tables ?? [];
    if (tables.length === 0 && /(?:login|로그인|session\s+expired|세션\s*만료)/i.test(fetched.text)) throw loginRequired(fetched.url);
    return tables;
  }
  async function enterScmContext(tab, poNumber) {
    await tab.navigate(`${COUPANG_SUPPLIER_ORIGIN}${purchaseOrderDetailPath(poNumber)}`, { timeoutMs: NAVIGATION_TIMEOUT_MS5 });
  }
  async function readPurchasableCenters(page) {
    const path = "/po-web/app/center/purchasable/list";
    const fetched = await page.fetch(path, { headers: { accept: "application/json" } });
    if (fetched.status < 200 || fetched.status >= 300 || fetched.text.trim().charAt(0) === "<") {
      throw new RuntimeError(SITE_REQUEST_FAILED, "\uC13C\uD130 \uBAA9\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { status: fetched.status, url: path, reason: "http", bodyHead: null });
    }
    try {
      return JSON.parse(fetched.text);
    } catch {
      throw responseInvalid(path, "\uC13C\uD130 \uBAA9\uB85D \uC751\uB2F5\uC774 JSON\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
    }
  }

  // extensions/src/sites/coupang-supplier/shipments.ts
  var COUPANG_SHIPMENT_URL = "https://supplier.coupang.com/ibs/asn/active";
  function parcelListPath(pageNumber) {
    return `/ibs/shipment/parcel/list?pageNumber=${pageNumber}&centerCode=&carrierCode=&estimatedDeliveryDate=&shipmentSeq=&purchaseOrderSeq=`;
  }
  var INVALID2 = "\uCFE0\uD321 \uC27D\uBA3C\uD2B8 \uBAA9\uB85D \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4. \uD655\uC7A5 \uD504\uB85C\uADF8\uB7A8\uC744 \uC0C8\uB85C\uACE0\uCE68\uD55C \uB4A4 \uB2E4\uC2DC \uC870\uD68C\uD574 \uC8FC\uC138\uC694.";
  async function readParcelPage(page, pageNumber) {
    const fetched = await page.fetch(parcelListPath(pageNumber), { headers: { "X-Requested-With": "XMLHttpRequest" }, tables: true });
    return parseParcelPage(fetched, pageNumber);
  }
  function parseParcelPage(fetched, pageNumber) {
    const path = parcelListPath(pageNumber);
    if (fetched.status < 200 || fetched.status >= 300) {
      if (fetched.status === 400 || fetched.status === 413 || fetched.status === 431) throw cookieBloat(path, fetched.status);
      if (fetched.status === 401 || fetched.status === 403) throw loginRequired(fetched.url);
      throw new RuntimeError(SITE_REQUEST_FAILED, `\uC27D\uBA3C\uD2B8 \uBAA9\uB85D \uC870\uD68C \uC2E4\uD328 (${pageNumber}\uCABD, HTTP ${fetched.status})`, {
        status: fetched.status,
        url: path,
        reason: "http",
        bodyHead: null
      });
    }
    if (fetched.redirected || /\/(?:login|sign-in|signin)(?:[/?#]|$)/i.test(fetched.url)) throw loginRequired(fetched.url);
    const table = fetched.tables?.find((candidate) => candidate.id === "parcel-tab");
    if (!table) {
      if (/(?:로그인|login|sign[ -]?in)/i.test(fetched.text)) throw loginRequired(fetched.url);
      throw responseInvalid(path, INVALID2);
    }
    const heads = table.rows.filter((row) => row.section === "thead").flatMap((row) => row.cells.filter((cell) => cell.header).map((cell) => cell.text.trim()));
    const index = (name) => heads.findIndex((head) => head.includes(name));
    const iSeq = index("\uC27D\uBA3C\uD2B8 \uBC88\uD638");
    const iOut = index("\uBC1C\uC1A1\uC77C");
    const iBox = index("\uBC15\uC2A4\uC218");
    if ([iSeq, iOut, iBox].some((position) => position < 0)) throw responseInvalid(path, INVALID2);
    const required = Math.max(iSeq, iOut, iBox) + 1;
    const rows = [];
    for (const row of table.rows) {
      if (row.section !== "tbody") continue;
      const cells = row.cells.filter((cell) => !cell.header).map((cell) => cell.text.trim());
      if (cells.length <= 1) continue;
      if (cells.length < required) throw responseInvalid(path, INVALID2);
      const seq = cells[iSeq];
      const outbound = cells[iOut];
      if (!seq || !/^\d{4}-\d{2}-\d{2}/.test(outbound)) throw responseInvalid(path, INVALID2);
      rows.push({ seq, outbound, boxes: cells[iBox] });
    }
    return rows;
  }

  // extensions/src/sites/coupang-supplier/index.ts
  var NAVIGATION_TIMEOUT_MS6 = 3e4;
  function purchaseOrderListPath(query, pageNumber) {
    return "/po-web/app/purchase-order/list?page=" + pageNumber + "&searchDateType=" + query.searchDateType + "&searchStartDate=" + query.from + "&searchEndDate=" + query.to + "&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq=&purchaseOrderStatus=" + query.status + "&purchaseOrderType=&skuIdArray=&crossdock=&transportType=";
  }
  function createCoupangSupplierSite(deps, lease = { tabId: null }) {
    let shipmentTab = null;
    let shipmentPage = null;
    let poTab = null;
    let poPage = null;
    let keepOpen = false;
    const remember = (work) => work.catch((error) => {
      if (keepTabFor(error)) keepOpen = true;
      throw error;
    });
    const withLogin = createSiteLoginGate(lease.credentials);
    const loginOn = (tab, reset) => async () => {
      const page = tab();
      if (!page || !lease.credentials) return { status: "unconfirmed" };
      const outcome = await ensureLoggedIn(page, COUPANG_SUPPLIER_LOGIN, lease.credentials, deps);
      reset();
      return outcome;
    };
    const shipmentLogin = loginOn(() => shipmentTab, () => {
      shipmentPage = null;
    });
    const poLogin = loginOn(() => poTab, () => {
      poPage = null;
    });
    function shipments() {
      shipmentPage ??= (async () => {
        const tab = shipmentTab ?? await deps.tabs.open("about:blank");
        shipmentTab = tab;
        await tab.navigate(COUPANG_SHIPMENT_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS6, continueOnTimeout: true });
        return supplierPage(tab);
      })();
      return shipmentPage;
    }
    function purchaseOrders() {
      poPage ??= (async () => {
        const tab = poTab ?? (lease.tabId !== null ? deps.tabs.attach(lease.tabId) : await deps.tabs.open("about:blank"));
        poTab = tab;
        return preparePoSession(tab);
      })();
      return poPage;
    }
    const onShipments = (read) => remember(withLogin(() => shipments().then(read), shipmentLogin));
    const onPurchaseOrders = (read) => remember(withLogin(() => purchaseOrders().then(read), poLogin));
    return {
      /** 쉽먼트 목록 한 쪽(1부터). 여러 쪽을 함께 불러도 된다(탭 하나). */
      parcelPage(pageNumber) {
        return onShipments((page) => readParcelPage(page, pageNumber));
      },
      /** 발주 목록 한 쪽(1부터)의 JSON 본문. 첫 쪽이 JSON이 아니면 로그인 필요. */
      purchaseOrderListPage(query, pageNumber) {
        return onPurchaseOrders((page) => readPurchaseOrderListPage(page, purchaseOrderListPath(query, pageNumber), pageNumber));
      },
      /** 발주서 상세의 표(칸 단위). */
      purchaseOrderDetail(poNumber) {
        return onPurchaseOrders((page) => readPurchaseOrderDetail(page, poNumber));
      },
      /** 직배송 센터 주소 목록 JSON. */
      purchasableCenters() {
        return onPurchaseOrders((page) => readPurchasableCenters(page));
      },
      /** 직배송: 품목 상세 전에 탭을 첫 발주서 상세로 옮긴다. */
      enterScmContext(poNumber) {
        return onPurchaseOrders(() => enterScmContext(poTab, poNumber));
      },
      /** 이 사이트가 연 탭을 닫는다(잠금이 준 탭은 브라우저 자원이 닫는다). 로그인·예상 밖 주소에서 멈췄으면 남긴다. */
      async close() {
        if (!keepOpen) {
          if (shipmentTab) await shipmentTab.close();
          if (poTab) await poTab.close();
        }
        shipmentTab = null;
        shipmentPage = null;
        poTab = null;
        poPage = null;
      }
    };
  }
  registerSite({ name: "coupang-supplier", origin: PO_BOOTSTRAP_URL, create: (deps, lease) => createCoupangSupplierSite(deps, lease) });

  // extensions/src/sites/domeggook/listings.ts
  var DOMEGGOOK_LISTINGS_URL = "https://www.domeggook.com/sc/item/lstAll";
  var DOMEGGOOK_LISTINGS_FILE = "content/orders/domeggook-listings.js";
  function createDomeggookListings(tabs, signIn) {
    return {
      readListings: (plan) => readMallListings(tabs, {
        mallKey: "domeggook",
        displayName: "\uB3C4\uB9E4\uAFB9",
        startUrl: DOMEGGOOK_LISTINGS_URL,
        file: DOMEGGOOK_LISTINGS_FILE,
        call: "domeggook.listings",
        guard: DOMEGGOOK_PAGE_GUARD
      }, plan, signIn)
    };
  }

  // extensions/src/sites/domeggook/index.ts
  var DOMEGGOOK_ORDER_LIST_URL = "https://domeggook.com/sc/order/lstAll";
  var DOMEGGOOK_ORDER_LIST_API = "https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1";
  var DOMEGGOOK_ORDERS_FILE = "content/orders/domeggook-orders.js";
  var DOMEGGOOK_PART_CHARS = 7e5;
  var LIST_RENDER_WAIT_MS = 1500;
  var REQUEST_TIMEOUT_MS = 6e4;
  var POLL_MS2 = 5e3;
  var POLL_ROUNDS = 48;
  var LOGIN_MESSAGE2 = "\uB3C4\uB9E4\uAFB9 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. domeggook.com \uC5D0 \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.";
  var DOMEGGOOK_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["domeggook.com"]),
    isLogin: (url) => hostWithin(url, ["domeggook.com"]) && /login/i.test(url.pathname),
    loginMessage: LOGIN_MESSAGE2
  };
  var DOMEGGOOK_LOGIN = {
    displayName: "\uB3C4\uB9E4\uAFB9",
    loginUrl: DOMEGGOOK_ORDER_LIST_URL,
    hosts: ["domeggook.com"],
    isLoginUrl: (url) => DOMEGGOOK_PAGE_GUARD.isLogin(url),
    fields: ["loginId", "password"]
  };
  async function orderList(caller) {
    const text5 = await caller.text(DOMEGGOOK_ORDER_LIST_API, { headers: { "x-requested-with": "XMLHttpRequest" } });
    let body = null;
    try {
      body = text5.trim().startsWith("{") ? JSON.parse(text5) : null;
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || body.res === false) {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE2, { url: DOMEGGOOK_ORDER_LIST_API });
    }
    const list = body.dat;
    return Array.isArray(list) ? list : [];
  }
  function pickDomeggookCsvUrl(entries, afterReq) {
    for (const entry of entries) {
      if (entry?.state !== "SUCCESS" || !/ORDER_ALL/.test(String(entry.dlBtn ?? ""))) continue;
      if (afterReq && !(String(entry.dateReq ?? "") > afterReq)) continue;
      const url = (String(entry.dlBtn).match(/href=['"]([^'"]+)['"]/) ?? [])[1];
      if (url) return url;
    }
    return null;
  }
  function base64Of(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return btoa(binary);
  }
  function createDomeggookSite(tabs, deps, signIn) {
    const caller = createSiteCaller({ minIntervalMs: 0, displayName: "\uB3C4\uB9E4\uAFB9", timeoutMs: 3e4 }, deps);
    return {
      ...createDomeggookListings(tabs, signIn),
      async readOrders(input) {
        const before = await (signIn ? signIn.beforeTab(tabs, () => orderList(caller)) : orderList(caller));
        const beforeReq = String(before[0]?.dateReq ?? "");
        const dateDot = input.collectionDate ? input.collectionDate.replace(/-/g, ".") : "";
        const listUrl = dateDot ? `${DOMEGGOOK_ORDER_LIST_URL}?dtbase=ord&dt1=${dateDot}&dt2=${dateDot}` : DOMEGGOOK_ORDER_LIST_URL;
        return withFreshTab(tabs, listUrl, async (page) => {
          await deps.sleep(LIST_RENDER_WAIT_MS);
          const answer = await callPage(page, "domeggook.requestExcel", {}, {
            timeoutMs: REQUEST_TIMEOUT_MS,
            guard: DOMEGGOOK_PAGE_GUARD,
            main: [DOMEGGOOK_ORDERS_FILE],
            displayName: "\uB3C4\uB9E4\uAFB9"
          });
          if (answer?.status === "empty") return { rows: [] };
          if (answer?.status !== "requested") {
            throw new RuntimeError(SITE_REQUEST_FAILED, answer?.status === "failed" ? answer.error : "\uB3C4\uB9E4\uAFB9 \uC5D1\uC140 \uC0DD\uC131 \uC694\uCCAD \uC2E4\uD328", {
              status: null,
              reason: "page_error",
              url: listUrl
            });
          }
          let csvUrl = null;
          for (let round = 0; round < POLL_ROUNDS && !csvUrl; round += 1) {
            await deps.sleep(POLL_MS2);
            input.signal?.throwIfAborted();
            csvUrl = pickDomeggookCsvUrl(await orderList(caller), beforeReq);
          }
          if (!csvUrl) {
            throw new RuntimeError(SITE_REQUEST_FAILED, "\uB3C4\uB9E4\uAFB9 \uC5D1\uC140 \uC0DD\uC131\uC774 \uC9C0\uC5F0\uB429\uB2C8\uB2E4(\uCD5C\uB300 4\uBD84 \uB300\uAE30 \uCD08\uACFC). \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.", {
              status: null,
              reason: "excel_not_ready",
              url: DOMEGGOOK_ORDER_LIST_API
            });
          }
          const base642 = base64Of(await caller.bytes(csvUrl, { redirect: "follow" }));
          const fileName = csvUrl.split("/").pop() || "domeggook.csv";
          const parts = Math.max(1, Math.ceil(base642.length / DOMEGGOOK_PART_CHARS));
          return {
            rows: Array.from({ length: parts }, (_, part) => ({
              fileName,
              part,
              parts,
              base64: base642.slice(part * DOMEGGOOK_PART_CHARS, (part + 1) * DOMEGGOOK_PART_CHARS)
            }))
          };
        }, signIn ? { signIn } : {});
      }
    };
  }
  registerSite({ name: "domeggook", create: (deps, lease) => createDomeggookSite(deps.tabs, deps, createSiteSignIn(DOMEGGOOK_LOGIN, lease.credentials, deps)) });

  // extensions/src/sites/icecream-mall/listings.ts
  var ICECREAM_LISTINGS_URL = "https://po.i-screammall.co.kr/goods/goodsMgmt.goodsMgmtView.do";
  var ICECREAM_LISTINGS_FILE = "content/orders/icecream-listings.js";
  function createIcecreamListings(tabs, signIn) {
    return {
      readListings: (plan) => readMallListings(tabs, {
        mallKey: "icecream-mall",
        displayName: "\uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0",
        startUrl: ICECREAM_LISTINGS_URL,
        file: ICECREAM_LISTINGS_FILE,
        call: "icecream-mall.listings",
        guard: ICECREAM_PAGE_GUARD
      }, plan, signIn)
    };
  }

  // extensions/src/sites/icecream-mall/index.ts
  var ICECREAM_MALL_URL = "https://po.i-screammall.co.kr/main.do";
  var ICECREAM_FRAMES_FILE = "content/orders/icecream-frames.js";
  var ICECREAM_MENU_FILE = "content/orders/icecream-menu.js";
  var ICECREAM_GRID_FILE = "content/orders/icecream-delivery-grid.js";
  var LOGIN_WATCH_ROUNDS = 16;
  var LOGIN_WATCH_MS = 500;
  var MENU_TIMEOUT_MS = 45e3;
  var GRID_TIMEOUT_MS = 35e3;
  var LOGIN_MESSAGE3 = "\uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0 \uD0ED\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.";
  var ICECREAM_DELIVERY_HEADERS = [
    "No",
    "\uC8FC\uBB38\uBC88\uD638",
    "\uBC30\uC1A1\uBC88\uD638",
    "\uC0AC\uC774\uD2B8",
    "\uC8FC\uBB38\uC644\uB8CC\uC77C\uC2DC",
    "\uC8FC\uBB38\uAD6C\uBD84",
    "\uC8FC\uBB38\uB0B4\uC5ED\uAD6C\uBD84",
    "\uC8FC\uBB38\uB0B4\uC5ED\uC0C1\uD0DC",
    "\uBC30\uC1A1\uC720\uD615",
    "\uBC30\uC1A1\uC885\uB958",
    "\uBC30\uC1A1\uCC98\uB9AC\uC720\uD615",
    "\uD0DD\uBC30\uC0AC",
    "\uC1A1\uC7A5\uBC88\uD638",
    "\uBC30\uC1A1\uC870\uD68C",
    "\uC8FC\uBB38\uD310\uB9E4\uC720\uD615",
    "\uAC70\uB798\uBA85\uC138\uC11C\uB3D9\uBD09\uC5EC\uBD80",
    "\uD569\uBC30\uC1A1\uC5EC\uBD80",
    "\uC9C1\uBC30\uBCC0\uACBD \uC0AC\uC720",
    "\uC0C1\uD488\uBC88\uD638",
    "\uC0C1\uD488\uBA85",
    "\uB2E8\uD488\uBA85",
    "\uCD9C\uACE0\uC218\uB7C9",
    "\uCD94\uAC00\uC785\uB825\uC635\uC158",
    "\uC99D\uC815\uD488",
    "\uC815\uC0C1\uAC00",
    "\uD310\uB9E4\uAC00",
    "\uD310\uB9E4\uAC00(\uD569\uACC4)",
    "\uACF5\uAE09\uAC00",
    "\uACF5\uAE09\uAC00(\uD569\uACC4)",
    "\uBC30\uC1A1\uBE44",
    "Y\uC8FC\uBB38\uBC88\uD638",
    "\uC785\uC810\uC0AC",
    "\uD68C\uC6D0ID",
    "\uC8FC\uBB38\uC790",
    "\uC218\uCDE8\uC778",
    "\uC218\uCDE8\uC778\uD734\uB300\uD3F0\uBC88\uD638",
    "\uC6B0\uD3B8\uBC88\uD638",
    "\uBC30\uC1A1\uC9C0",
    "\uBC30\uC1A1\uC694\uCCAD\uC0AC\uD56D",
    "\uBC30\uC1A1\uC9C0\uC2DC\uC77C\uC2DC",
    "\uCD9C\uACE0\uC9C0\uC2DC\uC77C\uC2DC",
    "\uCD9C\uACE0\uC644\uB8CC\uC77C\uC2DC"
  ];
  var ICECREAM_EXCLUDED_DELIVERY_STATUSES = [
    "\uCD9C\uACE0\uC644\uB8CC",
    "\uBC30\uC1A1\uC911",
    "\uBC30\uC1A1\uC644\uB8CC",
    "\uAD6C\uB9E4\uD655\uC815",
    "\uBC18\uD488\uC811\uC218",
    "\uD68C\uC218\uC9C0\uC2DC",
    "\uD68C\uC218\uD655\uC778",
    "\uD68C\uC218\uC644\uB8CC"
  ];
  var ICECREAM_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["i-screammall.co.kr"]),
    isLogin: (url) => hostWithin(url, ["i-screammall.co.kr"]) && /login/i.test(url.pathname),
    loginMessage: LOGIN_MESSAGE3
  };
  var ICECREAM_LOGIN = {
    displayName: "\uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0",
    loginUrl: ICECREAM_MALL_URL,
    hosts: ["i-screammall.co.kr"],
    isLoginUrl: (url) => ICECREAM_PAGE_GUARD.isLogin(url),
    fields: ["loginId", "password"],
    settleMs: LOGIN_WATCH_ROUNDS * LOGIN_WATCH_MS
  };
  function icecreamHasNoPendingOrders(diagnosis) {
    if (diagnosis.reason !== "data rows not found") return false;
    const orderRows = diagnosis.orderRows ?? 0;
    if (orderRows === 0) return (diagnosis.candidateRows ?? 0) > 0;
    return (diagnosis.doneExcluded ?? 0) >= orderRows;
  }
  function icecreamGridFailureMessage(diagnosis) {
    if (diagnosis.reason === "data rows not found") {
      if ((diagnosis.candidateRows ?? 0) > 0) {
        return `\uBC30\uC1A1\uBAA9\uB85D \uD45C(${diagnosis.candidateRows}\uD589)\uB294 \uCC3E\uC558\uC9C0\uB9CC \uC8FC\uBB38\uBC88\uD638(YYYYMMDDM\u2026) \uD615\uC2DD\uC758 \uC8FC\uBB38\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC8FC\uBB38\uBC88\uD638\uAC00 \uB9C8\uC2A4\uD0B9\uB418\uC5B4 \uC788\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
      }
      return "\uBC30\uC1A1\uBAA9\uB85D \uD45C\uB294 \uCC3E\uC558\uC9C0\uB9CC \uC8FC\uBB38 \uD589\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC870\uD68C \uACB0\uACFC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.";
    }
    if (diagnosis.reason === "header not found") {
      return "\uBC30\uC1A1\uC870\uD68C \uD654\uBA74\uC740 \uC5F4\uC5C8\uC9C0\uB9CC \uBC30\uC1A1\uBAA9\uB85D \uD45C \uBA38\uB9AC\uAE00\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uD45C\uAC00 \uB85C\uB529\uB41C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.";
    }
    if (diagnosis.reason === "not delivery inquiry frame") return "\uBC30\uC1A1\uC870\uD68C \uD654\uBA74\uC740 \uC5F4\uC5C8\uC9C0\uB9CC \uC218\uC9D1 \uAC00\uB2A5\uD55C \uBC30\uC1A1\uC870\uD68C \uD504\uB808\uC784\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
    return "\uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0 \uBC30\uC1A1\uC870\uD68C \uD654\uBA74\uC740 \uC5F4\uC5C8\uC9C0\uB9CC \uBC30\uC1A1\uBAA9\uB85D \uD45C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
  }
  function loginRequired2() {
    return new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE3, { url: ICECREAM_MALL_URL });
  }
  function createIcecreamMallSite(tabs, sleep, signIn) {
    async function inspect(page) {
      return page.frames([ICECREAM_FRAMES_FILE]);
    }
    return {
      ...createIcecreamListings(tabs, signIn),
      readOrders(input) {
        return withFreshTab(tabs, ICECREAM_MALL_URL, async (page) => {
          for (let round = 0; round < LOGIN_WATCH_ROUNDS; round += 1) {
            const frames = await inspect(page);
            if (frames.some((frame) => frame.result.loginPage)) throw loginRequired2();
            if (frames.some((frame) => frame.result.deliveryMenu || (frame.result.deliveryScore ?? 0) > 0)) break;
            await sleep(LOGIN_WATCH_MS);
          }
          const menu = await callPage(page, "icecream.openDeliveryInquiry", {}, {
            timeoutMs: MENU_TIMEOUT_MS,
            guard: ICECREAM_PAGE_GUARD,
            isolated: [ICECREAM_MENU_FILE],
            displayName: "\uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0"
          });
          if (menu?.status === "login_required") throw loginRequired2();
          if (menu?.status !== "opened") {
            throw new RuntimeError(SITE_REQUEST_FAILED, menu?.status === "failed" ? menu.error : "\uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0 \uBC30\uC1A1\uC870\uD68C \uD654\uBA74\uC744 \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", {
              status: null,
              reason: "page_error",
              url: ICECREAM_MALL_URL
            });
          }
          const inspected = await inspect(page);
          const scored = inspected.filter((frame) => (frame.result.deliveryScore ?? 0) > 0).sort((a, b) => (b.result.deliveryScore ?? 0) - (a.result.deliveryScore ?? 0));
          const targets = scored.length > 0 ? [scored[0].frameId] : [.../* @__PURE__ */ new Set([0, ...inspected.map((frame) => frame.frameId)])];
          const answers = [];
          for (const frameId of targets) {
            answers.push(await callPage(page, "icecream.deliveryGrid", {
              date: input.collectionDate,
              headers: ICECREAM_DELIVERY_HEADERS,
              excludedStatuses: ICECREAM_EXCLUDED_DELIVERY_STATUSES
            }, {
              timeoutMs: GRID_TIMEOUT_MS,
              guard: ICECREAM_PAGE_GUARD,
              main: [ICECREAM_GRID_FILE],
              displayName: "\uC544\uC774\uC2A4\uD06C\uB9BC\uBAB0",
              frameId
            }));
          }
          const grid = answers.filter((answer) => answer?.status === "ok").sort((a, b) => b.rows.length - a.rows.length)[0] ?? answers.find((answer) => answer?.status === "none" && answer.reason === "data rows not found") ?? answers.find((answer) => answer?.status === "none" && answer.reason === "header not found") ?? answers[0];
          if (grid?.status === "ok") return { rows: grid.rows, continuation: { headers: grid.headers, masked: grid.masked === true } };
          const diagnosis = grid?.status === "none" ? grid : {};
          if (icecreamHasNoPendingOrders(diagnosis)) return { rows: [] };
          throw new RuntimeError(SITE_REQUEST_FAILED, icecreamGridFailureMessage(diagnosis), {
            status: null,
            reason: "page_error",
            url: ICECREAM_MALL_URL,
            diagnosis
          });
        }, signIn ? { signIn } : {});
      }
    };
  }
  registerSite({ name: "icecream-mall", create: (deps, lease) => createIcecreamMallSite(deps.tabs, deps.sleep, createSiteSignIn(ICECREAM_LOGIN, lease.credentials, deps)) });

  // extensions/src/sites/kidkids/listings.ts
  var KIDKIDS_LISTINGS_URL = "https://partner.kidkids.net/sales/goods_list_renewal.htm?pNum=1";
  var KIDKIDS_LISTINGS_FILE = "content/orders/kidkids-listings.js";
  function createKidkidsListings(tabs, signIn) {
    return {
      readListings: (plan) => readMallListings(tabs, {
        mallKey: "kidkids",
        displayName: "\uD0A4\uB4DC\uD0A4\uC988",
        startUrl: KIDKIDS_LISTINGS_URL,
        file: KIDKIDS_LISTINGS_FILE,
        call: "kidkids.listings",
        guard: KIDKIDS_PAGE_GUARD
      }, plan, signIn)
    };
  }

  // extensions/src/sites/kidkids/index.ts
  var KIDKIDS_ORDER_URL = "https://partner.kidkids.net/new/pages/logis/management.htm";
  var KIDKIDS_ORDERS_FILE = "content/orders/kidkids-orders.js";
  var READ_TIMEOUT_MS3 = 18e4;
  var LOGIN_MESSAGE4 = "\uD0A4\uB4DC\uD0A4\uC988 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uD0A4\uB4DC\uD0A4\uC988 \uD0ED\uC5D0\uC11C \uB85C\uADF8\uC778(\uBCF8\uC778\uD655\uC778)\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.";
  var KIDKIDS_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["kidkids.net"]),
    isLogin: (url) => hostWithin(url, ["kidkids.net"]) && (/login|partnerlogin|partner_login/i.test(url.pathname) || /\/security\/verify_user\.htm$/i.test(url.pathname)),
    loginMessage: LOGIN_MESSAGE4
  };
  var KIDKIDS_LOGIN = {
    displayName: "\uD0A4\uB4DC\uD0A4\uC988",
    loginUrl: KIDKIDS_ORDER_URL,
    hosts: ["kidkids.net"],
    isLoginUrl: (url) => hostWithin(url, ["kidkids.net"]) && /login|partnerlogin|partner_login/i.test(url.pathname),
    isVerificationUrl: (url) => /\/security\/verify_user\.htm$/i.test(url.pathname),
    fields: ["loginId", "password"],
    settleMs: 5e3
  };
  function createKidkidsSite(tabs, signIn) {
    return {
      ...createKidkidsListings(tabs, signIn),
      readOrders(input) {
        return withFreshTab(tabs, KIDKIDS_ORDER_URL, async (page) => {
          const answer = await callPage(page, "kidkids.orders", { dateFilter: input.collectionDate ?? "" }, {
            timeoutMs: READ_TIMEOUT_MS3,
            guard: KIDKIDS_PAGE_GUARD,
            isolated: [KIDKIDS_ORDERS_FILE],
            displayName: "\uD0A4\uB4DC\uD0A4\uC988"
          });
          if (answer?.status === "ok") return { rows: answer.orders };
          if (answer?.status === "login_required") throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE4, { url: KIDKIDS_ORDER_URL });
          throw new RuntimeError(SITE_REQUEST_FAILED, `\uD0A4\uB4DC\uD0A4\uC988 \uC8FC\uBB38\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${answer?.status === "failed" ? answer.error : "\uC54C \uC218 \uC5C6\uC74C"}`, {
            status: null,
            reason: "page_error",
            url: KIDKIDS_ORDER_URL
          });
        }, signIn ? { signIn } : {});
      }
    };
  }
  registerSite({ name: "kidkids", create: (deps, lease) => createKidkidsSite(deps.tabs, createSiteSignIn(KIDKIDS_LOGIN, lease.credentials, deps)) });

  // extensions/src/sites/live-commerce/index.ts
  var NAVIGATION_TIMEOUT_MS7 = 35e3;
  var EXTRACTION_TIMEOUT_MS3 = 25e3;
  var MAX_PRODUCTS = 100;
  var CONTENT_FILES = {
    isolated: ["content/sourcing/live-commerce-extractor.js", "content/sourcing/live-commerce-content.js"]
  };
  var SITE_VERIFICATION_REQUIRED5 = "SITE_VERIFICATION_REQUIRED";
  var LIVE_COMMERCE_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["1688.com", "douyin.com"]),
    isLogin: (url) => hostWithin(url, ["login.taobao.com", "login.1688.com", "passport.1688.com", "sso.douyin.com", "passport.douyin.com"]) || hostWithin(url, ["douyin.com"]) && /\/login/i.test(url.pathname),
    loginMessage: "\uB77C\uC774\uBE0C \uBC29\uC1A1 \uC0AC\uC774\uD2B8 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uD0ED\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694."
  };
  var LIVE_COMMERCE_SITE = {
    name: "live-commerce",
    origin: "https://live.douyin.com",
    caller: { minIntervalMs: 0, displayName: "\uB77C\uC774\uBE0C \uBC29\uC1A1" }
  };
  function isLiveVerificationUrl(value) {
    try {
      const url = new URL(value);
      return url.pathname.includes("/punish") || url.searchParams.get("action") === "captcha" || /(?:verify|captcha)/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function isLiveLoginUrl(value) {
    try {
      return LIVE_COMMERCE_PAGE_GUARD.isLogin(new URL(value)) || /\/login/i.test(new URL(value).pathname);
    } catch {
      return false;
    }
  }
  var MAX_VERIFICATION_ROUNDS2 = 5;
  function createLiveCommerceSite(tabs) {
    return {
      async broadcast(pageUrl, options = {}) {
        const page = await tabs.open("about:blank");
        let keepOpen = false;
        try {
          const stopAt = (url) => isLiveVerificationUrl(url) || isLiveLoginUrl(url);
          let landed = await page.navigate(pageUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS7, stopAt });
          for (let round = 1; isLiveVerificationUrl(landed) && !isLiveLoginUrl(landed); round += 1) {
            const cleared = round <= MAX_VERIFICATION_ROUNDS2 && await waitForOperator(page, isLiveVerificationUrl, { kind: "verification", site: "\uB77C\uC774\uBE0C \uBC29\uC1A1", label: "\uBC29\uC1A1" }, options.onAttention);
            if (!cleared) {
              keepOpen = true;
              throw verification2(landed);
            }
            landed = await page.navigate(pageUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS7, stopAt });
          }
          if (isLiveLoginUrl(landed)) {
            keepOpen = true;
            throw new RuntimeError(SITE_LOGIN_REQUIRED, LIVE_COMMERCE_PAGE_GUARD.loginMessage, { url: landed });
          }
          let extracted;
          try {
            extracted = await page.ask(
              { type: "TRIGGER_LIVE_COMMERCE_EXTRACT" },
              { timeoutMs: EXTRACTION_TIMEOUT_MS3, inject: CONTENT_FILES, guard: LIVE_COMMERCE_PAGE_GUARD }
            );
          } catch (error) {
            if (leftForOperator(error)) keepOpen = true;
            throw error;
          }
          if (extracted.status === "verification_required") {
            keepOpen = true;
            throw verification2(extracted.verificationUrl ?? landed);
          }
          if (!extracted.ok || !extracted.broadcast || !extracted.source || !extracted.pageUrl) {
            throw new RuntimeError(SITE_REQUEST_FAILED, `\uBC29\uC1A1 \uC815\uBCF4\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4(${extracted.error ?? "\uC54C \uC218 \uC5C6\uC74C"}).`, { status: null, url: pageUrl });
          }
          return {
            source: extracted.source,
            pageUrl: extracted.pageUrl,
            broadcast: extracted.broadcast,
            products: (Array.isArray(extracted.products) ? extracted.products : []).slice(0, MAX_PRODUCTS)
          };
        } finally {
          if (!keepOpen) await page.close();
        }
      }
    };
  }
  function verification2(url) {
    return new RuntimeError(SITE_VERIFICATION_REQUIRED5, "\uBC29\uC1A1 \uD398\uC774\uC9C0\uAC00 \uB85C\uADF8\uC778\uC774\uB098 \uAC80\uC99D\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uD0ED\uC5D0\uC11C \uCC98\uB9AC\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url });
  }
  registerSite({ name: LIVE_COMMERCE_SITE.name, create: (deps) => createLiveCommerceSite(deps.tabs) });

  // extensions/src/sites/mall-admin-listings/index.ts
  var MALL_ADMIN_LISTINGS_SITE = "mall-admin-listings";
  registerSite({
    name: MALL_ADMIN_LISTINGS_SITE,
    opensOwnTabs: true,
    create: (deps, lease) => ({
      reader: (mallKey) => isMallAdminListingOperationMall(mallKey) ? siteFactoryFor(mallKey)?.create(deps, lease) ?? null : null
    })
  });

  // extensions/src/sites/mall-orders/index.ts
  var MALL_ORDERS_SITE = "mall-orders";
  registerSite({
    name: MALL_ORDERS_SITE,
    opensOwnTabs: true,
    create: (deps, lease) => ({
      reader: (mallKey) => isMallOrderOperationMall(mallKey) ? siteFactoryFor(mallKey)?.create(deps, lease) ?? null : null
    })
  });

  // extensions/src/sites/product-page/description.ts
  function parseDescriptionHtml(html) {
    const content = offerDetailsContent(html) ?? html;
    const images = [];
    for (const match of content.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
      const src = match[1];
      if (src.startsWith("data:") || src.includes("icon") || src.includes("logo")) continue;
      const full = src.startsWith("//") ? `https:${src}` : src;
      if (!images.includes(full)) images.push(full);
    }
    const blocks = [];
    const seen = /* @__PURE__ */ new Set();
    for (const match of content.matchAll(/<(?:p|h[1-6]|li|td|th|div|span)[^>]*>([^<]{5,})<\//gi)) {
      const text5 = match[1].replace(/&[^;]+;/g, " ").trim();
      if (text5.length < 5 || text5.length > 2e3 || seen.has(text5)) continue;
      seen.add(text5);
      blocks.push(text5);
    }
    if (images.length === 0 && blocks.length === 0) return null;
    return { description_images: images, description_text: blocks.join("\n").slice(0, 1e4), description_image_count: images.length };
  }
  function offerDetailsContent(html) {
    const marker = "var offer_details=";
    const start = html.indexOf(marker);
    if (start === -1) return null;
    const jsonStart = start + marker.length;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = jsonStart; index < html.length; index += 1) {
      const char = html.charAt(index);
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed2 = JSON.parse(html.substring(jsonStart, index + 1));
            return typeof parsed2.content === "string" ? parsed2.content : null;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
  function allowedSupplierUrl(value) {
    try {
      const parsed2 = new URL(String(value ?? "").trim());
      const host = parsed2.hostname.toLowerCase().replace(/\.$/, "");
      if (parsed2.protocol !== "https:" || parsed2.username || parsed2.password || parsed2.port && parsed2.port !== "443") return null;
      if (!["1688.com", "alibaba.com"].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
      parsed2.hostname = host;
      parsed2.hash = "";
      return parsed2.toString();
    } catch {
      return null;
    }
  }

  // extensions/src/sites/product-page/index.ts
  var EXTRACTION_TIMEOUT_MS4 = 2e4;
  var TRIGGER_TIMEOUT_MS = 5e3;
  var EXTRACTOR_FILES = [
    "content/sourcing/extractors/common.js",
    "content/sourcing/extractors/alibaba.js",
    "content/sourcing/extractors/1688.js",
    "content/sourcing/content.js"
  ];
  var PRODUCT_PAGE_MOVED = "PRODUCT_PAGE_MOVED";
  var PRODUCT_EXTRACTION_TIMEOUT = "PRODUCT_EXTRACTION_TIMEOUT";
  var PRODUCT_PAGE_SITE = {
    name: "product-page",
    origin: "https://detail.1688.com",
    caller: { minIntervalMs: 0, displayName: "1688\xB7Alibaba \uC0C1\uD488" }
  };
  function productPageInjection(url) {
    const host = new URL(url).hostname;
    const main = host.endsWith("1688.com") ? ["content/sourcing/extractors/1688-bridge.js"] : host.endsWith("alibaba.com") ? ["content/sourcing/extractors/page-bridge.js"] : [];
    return { isolated: EXTRACTOR_FILES, main };
  }
  function createProductPageSite(tabs, tabId, deps) {
    return {
      async extract(sourceUrl) {
        const page = tabs.attach(tabId);
        const current = await page.currentUrl();
        if (current !== sourceUrl) {
          throw new RuntimeError(PRODUCT_PAGE_MOVED, "\uC218\uC9D1\uC744 \uC2DC\uC791\uD55C \uB4A4 \uD0ED \uC8FC\uC18C\uAC00 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C1\uD488 \uD398\uC774\uC9C0\uC5D0\uC11C \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url: current });
        }
        const marker = deps.randomId();
        let product = null;
        let description;
        let settle;
        const settled = new Promise((resolve) => {
          settle = resolve;
        });
        const stop = page.listen((message) => {
          if (message.attemptId !== marker) return;
          if (message.type === "PRODUCT_DATA" && !product && isRecord(message.data)) {
            product = message.data;
            if (product.page_type === "search") settle({ product: withSourceUrl(product, sourceUrl), hadDescription: false });
          } else if (message.type === "DESCRIPTION_DATA" && isRecord(message.data)) {
            description = message.data;
          } else if (message.type === "EXTRACTION_COMPLETE" && product) {
            const hadDescription = message.hadDescription === true;
            if (hadDescription !== Boolean(description)) {
              settle(new RuntimeError(SITE_REQUEST_FAILED, "\uC0C1\uD488 \uC124\uBA85 \uCD94\uCD9C \uC644\uB8CC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { status: null, url: sourceUrl }));
            } else {
              settle({ product: withSourceUrl(product, sourceUrl), ...description ? { description } : {}, hadDescription });
            }
          }
        });
        const timer = setTimeout(() => settle(new RuntimeError(PRODUCT_EXTRACTION_TIMEOUT, "\uC0C1\uD488 \uCD94\uCD9C \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url: sourceUrl })), EXTRACTION_TIMEOUT_MS4);
        try {
          const started = await page.ask({ type: "TRIGGER_EXTRACT", attemptId: marker }, { timeoutMs: TRIGGER_TIMEOUT_MS, inject: productPageInjection(sourceUrl) });
          if (started.ok === false) {
            throw new RuntimeError(SITE_REQUEST_FAILED, "\uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { status: null, url: sourceUrl, reason: started.error });
          }
          const result = await settled;
          if (result instanceof RuntimeError) throw result;
          await enrich(result.product);
          return result;
        } finally {
          clearTimeout(timer);
          stop();
        }
      }
    };
    async function enrich(product) {
      const detailUrl = product.source_platform === "1688" ? allowedSupplierUrl(product._detail_url) : null;
      if (!detailUrl) return;
      const html = await tabs.fetchText(detailUrl);
      const content = html ? parseDescriptionHtml(html) : null;
      if (content) Object.assign(product, content);
    }
  }
  function withSourceUrl(product, sourceUrl) {
    return { ...product, source_url: typeof product.source_url === "string" ? product.source_url : sourceUrl };
  }
  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  var PRODUCT_TAB_REQUIRED = "PRODUCT_TAB_REQUIRED";
  registerSite({
    name: PRODUCT_PAGE_SITE.name,
    create: (deps, lease) => lease.tabId !== null ? createProductPageSite(deps.tabs, lease.tabId, { randomId: deps.randomId }) : {
      extract: async () => {
        throw new RuntimeError(PRODUCT_TAB_REQUIRED, "\uC0C1\uD488 \uC218\uC9D1\uC740 \uD655\uC7A5 \uD31D\uC5C5\uC758 [\uD604\uC7AC \uC0C1\uD488 \uC218\uC9D1]\uC5D0\uC11C \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
      }
    }
  });

  // extensions/src/sites/sabangnet/index.ts
  var SABANGNET_ORIGIN = "https://sbadmin08.sabangnet.co.kr";
  var PAGE_URL = `${SABANGNET_ORIGIN}/`;
  var SABANGNET_MALL_LISTINGS_FILE = "content/orders/sabangnet-mall-listings.js";
  var NAVIGATION_TIMEOUT_MS8 = 45e3;
  var PAGE_CALL_TIMEOUT_MS = 35e3;
  var SABANGNET_PAGE_DELAY_MS = 800;
  var LOGIN_MESSAGE5 = "\uC0AC\uBC29\uB137 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB9B0 \uC0AC\uBC29\uB137 \uD654\uBA74\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uAC00\uC838\uC640 \uC8FC\uC138\uC694.";
  var MALL_CONTRACT_CHANGED4 = "MALL_CONTRACT_CHANGED";
  var SABANGNET_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["sabangnet.co.kr"]),
    isLogin: (url) => hostWithin(url, ["sabangnet.co.kr"]) && /login/i.test(`${url.pathname}${url.hash}`),
    loginMessage: LOGIN_MESSAGE5
  };
  function createSabangnetSite(tabs, sleep) {
    let pagesRead = 0;
    let tab = null;
    let opened = null;
    let keepOpen = false;
    function page() {
      tab ??= (async () => {
        const next = await tabs.open("about:blank");
        opened = next;
        await next.navigate(PAGE_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS8 });
        return next;
      })();
      return tab;
    }
    async function read(query, currentPage) {
      if (pagesRead > 0) await sleep(SABANGNET_PAGE_DELAY_MS);
      pagesRead += 1;
      const answer = await callPage(await page(), "sabangnet.mallListingPage", { ...query, currentPage }, {
        timeoutMs: PAGE_CALL_TIMEOUT_MS,
        guard: SABANGNET_PAGE_GUARD,
        isolated: [SABANGNET_MALL_LISTINGS_FILE],
        displayName: "\uC0AC\uBC29\uB137"
      });
      switch (answer?.status) {
        case "ok":
          return { total: answer.total, items: answer.items };
        case "login_required":
          throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE5, { url: PAGE_URL });
        case "http_error":
          throw new RuntimeError(SITE_REQUEST_FAILED, `\uC0AC\uBC29\uB137 \uC1A1\uC2E0 \uAE30\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4(HTTP ${answer.httpStatus}).`, {
            status: answer.httpStatus,
            url: PAGE_URL,
            reason: "http",
            bodyHead: null
          });
        case "contract_drift":
          throw new RuntimeError(MALL_CONTRACT_CHANGED4, `\uC0AC\uBC29\uB137 \uBAA9\uB85D \uD615\uC2DD\uC774 \uBC14\uB00C\uC5B4 \uAC00\uC838\uC624\uAE30\uB97C \uBA48\uCDC4\uC2B5\uB2C8\uB2E4. [${answer.stage}]`, { stage: answer.stage });
        case "timeout":
          throw new RuntimeError(SITE_REQUEST_FAILED, "\uC0AC\uBC29\uB137 \uC751\uB2F5\uC774 \uB2A6\uC5B4 \uAC00\uC838\uC624\uAE30\uB97C \uBA48\uCDC4\uC2B5\uB2C8\uB2E4.", { status: null, url: PAGE_URL, reason: "timeout", bodyHead: null });
        default:
          throw new RuntimeError(SITE_REQUEST_FAILED, "\uC0AC\uBC29\uB137 \uC1A1\uC2E0 \uAE30\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { status: null, url: PAGE_URL, reason: "network", bodyHead: null });
      }
    }
    return {
      /** "쇼핑몰상품수정" 목록 한 쪽(1부터). 실패 이력 줄은 뺀다. `total`은 사방넷이 알린 전체 송신 기록 수. */
      async mallListingPage(query, currentPage) {
        try {
          return await read(query, currentPage);
        } catch (error) {
          if (leftForOperator(error)) keepOpen = true;
          throw error;
        }
      },
      /** 이 사이트가 연 탭을 닫는다. 로그인·예상 밖 주소에서 멈췄으면 남긴다. */
      async close() {
        if (opened && !keepOpen) await opened.close();
        opened = null;
        tab = null;
      }
    };
  }
  registerSite({ name: "sabangnet", opensOwnTabs: true, create: (deps) => createSabangnetSite(deps.tabs, deps.sleep) });

  // extensions/src/sites/sellpia/tracking.ts
  var SELLPIA_ORIGIN = "https://kiditem.sellpia.com";
  var SELLPIA_REPRINT_URL = `${SELLPIA_ORIGIN}/order_delivery_reprint.html`;
  var SELLPIA_SHIPMENT_TRACKING_FILE = "content/orders/sellpia-shipment-tracking.js";
  var QUERY_TIMEOUT_MS = 6e4;
  var LOGIN_MESSAGE6 = "\uC140\uD53C\uC544 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uC140\uD53C\uC544 \uD0ED\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC870\uD68C\uD574 \uC8FC\uC138\uC694.";
  var SELLPIA_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["sellpia.com"]),
    isLogin: (url) => hostWithin(url, ["sellpia.com"]) && /login/i.test(url.pathname),
    loginMessage: LOGIN_MESSAGE6
  };
  function createSellpiaTracking(tabs) {
    return {
      /** 기간(송장번호채번일자) 안 전 몰 송장. 행은 주문번호·송장번호가 있는 것만, `total`은 셀피아가 준 목록 수. */
      shipmentTracking(input) {
        return withFreshTab(tabs, SELLPIA_REPRINT_URL, async (page) => {
          const answer = await callPage(page, "sellpia.shipmentTracking", { startDate: input.startDate, endDate: input.endDate }, {
            timeoutMs: QUERY_TIMEOUT_MS,
            guard: SELLPIA_PAGE_GUARD,
            main: [SELLPIA_SHIPMENT_TRACKING_FILE],
            displayName: "\uC140\uD53C\uC544"
          });
          switch (answer?.status) {
            case "ok":
              return { rows: answer.rows, total: answer.total };
            case "login_required":
              throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE6, { url: SELLPIA_REPRINT_URL });
            case "http_error":
              throw new RuntimeError(SITE_REQUEST_FAILED, `\uC140\uD53C\uC544 \uC1A1\uC7A5 \uC870\uD68C\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4(HTTP ${answer.httpStatus}).`, {
                status: answer.httpStatus,
                url: SELLPIA_REPRINT_URL,
                reason: "http",
                bodyHead: null
              });
            default:
              throw new RuntimeError(SITE_REQUEST_FAILED, "\uC140\uD53C\uC544 \uC1A1\uC7A5 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", {
                status: null,
                url: SELLPIA_REPRINT_URL,
                reason: "not_json",
                bodyHead: null
              });
          }
        });
      }
    };
  }

  // extensions/src/sites/sellpia/inventory.ts
  var SELLPIA_INVENTORY_URL = `${SELLPIA_ORIGIN}/product_list_total.html`;
  var SELLPIA_INVENTORY_FILE = "content/orders/sellpia-inventory.js";
  var REQUEST_TIMEOUT_MS2 = 45e3;
  var MAX_ROWS = 2e4;
  var MAX_BYTES = 10 * 1024 * 1024;
  var CALL_TIMEOUT_MS2 = REQUEST_TIMEOUT_MS2 + 1e3;
  function createSellpiaInventory(tabs) {
    return {
      inventory() {
        return withFreshTab(tabs, SELLPIA_INVENTORY_URL, async (page) => {
          const answer = await callPage(page, "sellpia.inventory", { timeoutMs: REQUEST_TIMEOUT_MS2, maxRows: MAX_ROWS, maxBytes: MAX_BYTES }, {
            timeoutMs: CALL_TIMEOUT_MS2,
            guard: SELLPIA_PAGE_GUARD,
            main: [SELLPIA_INVENTORY_FILE],
            displayName: "\uC140\uD53C\uC544"
          });
          switch (answer?.status) {
            case "ok":
              return { rows: answer.rows };
            case "login_required":
              throw new RuntimeError(SITE_LOGIN_REQUIRED, SELLPIA_PAGE_GUARD.loginMessage, { url: SELLPIA_INVENTORY_URL });
            case "http_error":
              throw failed(`\uC140\uD53C\uC544 \uC7AC\uACE0 \uC870\uD68C\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4(HTTP ${answer.httpStatus}).`, { status: answer.httpStatus, reason: "http" });
            case "timeout":
              throw failed("\uC140\uD53C\uC544 \uC7AC\uACE0 \uC870\uD68C\uAC00 \uC81C\uB54C \uB05D\uB098\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", { status: null, reason: "timeout" });
            case "network_error":
              throw failed("\uC140\uD53C\uC544 \uC7AC\uACE0 \uC870\uD68C\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { status: null, reason: "network" });
            case "unexpected_response":
              throw failed("\uC140\uD53C\uC544 \uC7AC\uACE0 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { status: null, reason: "not_json", detail: answer.reason ?? null });
            default:
              throw failed("\uC140\uD53C\uC544 \uC7AC\uACE0 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { status: null, reason: "not_json" });
          }
        });
      }
    };
  }
  function failed(message, details) {
    return new RuntimeError(SITE_REQUEST_FAILED, message, { url: SELLPIA_INVENTORY_URL, bodyHead: null, ...details });
  }

  // extensions/src/sites/sellpia/profit.ts
  var SELLPIA_PROFIT_URL = `${SELLPIA_ORIGIN}/stat_prd_profit.html#none`;
  var SELLPIA_PROFIT_FILE = "content/orders/sellpia-profit.js";
  var QUERY_TIMEOUT_MS2 = 9e4;
  function createSellpiaProfit(tabs) {
    return {
      productProfit(input, onProgress) {
        return withFreshTab(tabs, SELLPIA_PROFIT_URL, async (page) => {
          const baseline = await readRows(page, { start: input.start, end: input.end, purchaseStart: input.start, purchaseEnd: input.end });
          const periods = [];
          for (const period of input.periods) {
            input.signal?.throwIfAborted();
            periods.push({
              yearMonth: period.yearMonth,
              rows: await readRows(page, { start: input.start, end: input.end, purchaseStart: period.from, purchaseEnd: period.to })
            });
            await onProgress?.(periods.length, input.periods.length);
          }
          return { baseline, periods };
        });
      }
    };
  }
  async function readRows(page, args) {
    const answer = await callPage(page, "sellpia.profitRows", args, {
      timeoutMs: QUERY_TIMEOUT_MS2,
      guard: SELLPIA_PAGE_GUARD,
      main: [SELLPIA_PROFIT_FILE],
      displayName: "\uC140\uD53C\uC544"
    });
    switch (answer?.status) {
      case "ok":
        return { products: answer.products, skippedAdjustmentCount: answer.skippedAdjustmentCount };
      case "login_required":
        throw new RuntimeError(SITE_LOGIN_REQUIRED, SELLPIA_PAGE_GUARD.loginMessage, { url: SELLPIA_PROFIT_URL });
      case "http_error":
        throw failed2(`\uC140\uD53C\uC544 \uC0C1\uD488\uBCC4 \uC774\uC775\uD604\uD669 \uC870\uD68C\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4(HTTP ${answer.httpStatus}).`, { status: answer.httpStatus, reason: "http" });
      case "unexpected_response":
        throw failed2("\uC140\uD53C\uC544 \uC0C1\uD488\uBCC4 \uC774\uC775\uD604\uD669 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { status: null, reason: "not_json", detail: answer.reason ?? null });
      default:
        throw failed2("\uC140\uD53C\uC544 \uC0C1\uD488\uBCC4 \uC774\uC775\uD604\uD669 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { status: null, reason: "not_json" });
    }
  }
  function failed2(message, details) {
    return new RuntimeError(SITE_REQUEST_FAILED, message, { url: SELLPIA_PROFIT_URL, bodyHead: null, ...details });
  }

  // extensions/src/sites/sellpia/sales.ts
  var SELLPIA_SALES_URL = `${SELLPIA_ORIGIN}/sale_summary.html?mode=main_link`;
  var SELLPIA_SALES_FILE = "content/orders/sellpia-sales.js";
  var QUERY_TIMEOUT_MS3 = 6e4;
  function createSellpiaSales(tabs) {
    return {
      sales(input) {
        return withFreshTab(tabs, SELLPIA_SALES_URL, async (page) => {
          const answer = await callPage(page, "sellpia.sales", { startDate: input.startDate, endDate: input.endDate }, {
            timeoutMs: QUERY_TIMEOUT_MS3,
            guard: SELLPIA_PAGE_GUARD,
            main: [SELLPIA_SALES_FILE],
            displayName: "\uC140\uD53C\uC544"
          });
          switch (answer?.status) {
            case "ok":
              return { rows: answer.rows, sellers: answer.sellers };
            case "login_required":
              throw new RuntimeError(SITE_LOGIN_REQUIRED, SELLPIA_PAGE_GUARD.loginMessage, { url: SELLPIA_SALES_URL });
            case "http_error":
              throw failed3(`\uC140\uD53C\uC544 \uD310\uB9E4\uD604\uD669 \uC870\uD68C\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4(HTTP ${answer.httpStatus}).`, { status: answer.httpStatus, reason: "http" });
            case "unexpected_response":
              throw failed3("\uC140\uD53C\uC544 \uD310\uB9E4\uD604\uD669 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { status: null, reason: "not_json", detail: answer.reason ?? null });
            default:
              throw failed3("\uC140\uD53C\uC544 \uD310\uB9E4\uD604\uD669 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { status: null, reason: "not_json" });
          }
        });
      }
    };
  }
  function failed3(message, details) {
    return new RuntimeError(SITE_REQUEST_FAILED, message, { url: SELLPIA_SALES_URL, bodyHead: null, ...details });
  }

  // extensions/src/sites/sellpia/manual-match.ts
  var SELLPIA_MANUAL_MATCH_URL = `${SELLPIA_ORIGIN}/product_manual_match.html`;
  var SELLPIA_MANUAL_MATCH_FILE = "content/orders/sellpia-manual-match.js";
  var NAVIGATION_TIMEOUT_MS9 = 45e3;
  var SEARCH_TIMEOUT_MS = 10 * 6e4;
  var STATUS_TIMEOUT_MS = 6e4;
  var LOGIN_MESSAGE7 = "\uC140\uD53C\uC544 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB9B0 \uC218\uB3D9\uC0C1\uD488\uB9E4\uCE6D \uD654\uBA74\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
  var MALL_CONTRACT_CHANGED5 = "MALL_CONTRACT_CHANGED";
  function createSellpiaManualMatch(tabs) {
    let tab = null;
    let opened = null;
    let keepOpen = false;
    function page() {
      tab ??= (async () => {
        const next = await tabs.open("about:blank");
        opened = next;
        await next.navigate(SELLPIA_MANUAL_MATCH_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS9 });
        return next;
      })();
      return tab;
    }
    async function ask(call2, args, timeoutMs) {
      try {
        const answer = await callPage(await page(), call2, args, {
          timeoutMs,
          guard: SELLPIA_PAGE_GUARD,
          isolated: [SELLPIA_MANUAL_MATCH_FILE],
          displayName: "\uC140\uD53C\uC544"
        });
        switch (answer?.status) {
          case "ok":
            return answer;
          case "login_required":
            throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE7, { url: SELLPIA_MANUAL_MATCH_URL });
          case "contract_drift":
            throw new RuntimeError(MALL_CONTRACT_CHANGED5, `\uC140\uD53C\uC544 \uC218\uB3D9\uC0C1\uD488\uB9E4\uCE6D \uD654\uBA74\uC774 \uBC14\uB00C\uC5B4 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. [${answer.stage}]`, { stage: answer.stage });
          case "http_error":
            throw new RuntimeError(SITE_REQUEST_FAILED, `\uC140\uD53C\uC544 \uC218\uB3D9\uC0C1\uD488\uB9E4\uCE6D \uC694\uCCAD\uC774 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4(HTTP ${answer.httpStatus}).`, {
              status: answer.httpStatus,
              url: SELLPIA_MANUAL_MATCH_URL,
              reason: "http",
              bodyHead: null
            });
          case "timeout":
            throw new RuntimeError(SITE_REQUEST_FAILED, "\uC140\uD53C\uC544 \uC218\uB3D9\uC0C1\uD488\uB9E4\uCE6D \uADFC\uAC70 \uC218\uC9D1 \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", {
              status: null,
              url: SELLPIA_MANUAL_MATCH_URL,
              reason: "timeout",
              bodyHead: null
            });
          default:
            throw new RuntimeError(SITE_REQUEST_FAILED, "\uC140\uD53C\uC544 \uC218\uB3D9\uC0C1\uD488\uB9E4\uCE6D \uC751\uB2F5 \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4.", {
              status: null,
              url: SELLPIA_MANUAL_MATCH_URL,
              reason: "not_json",
              bodyHead: null
            });
        }
      } catch (error) {
        if (leftForOperator(error)) keepOpen = true;
        throw error;
      }
    }
    return {
      /** 대상 코드마다 매칭 검색(동시 4). 매칭 제목이 없는 줄은 뺀다. */
      async manualMatchSearch(codes) {
        return (await ask("sellpia.manualMatchSearch", { codes: [...codes] }, SEARCH_TIMEOUT_MS)).candidates;
      },
      /** md5 100개 이하의 매칭 종류(M·P·E). */
      async manualMatchStatus(matchMd5s) {
        return (await ask("sellpia.manualMatchStatus", { matchMd5s: [...matchMd5s] }, STATUS_TIMEOUT_MS)).types;
      },
      /** 수동매칭이 연 탭을 닫는다. 로그인·예상 밖 주소에서 멈췄으면 남긴다. */
      async closeManualMatch() {
        if (opened && !keepOpen) await opened.close();
        opened = null;
        tab = null;
      }
    };
  }

  // extensions/src/sites/sellpia/index.ts
  function createSellpiaSite(tabs) {
    return {
      ...createSellpiaTracking(tabs),
      ...createSellpiaInventory(tabs),
      ...createSellpiaSales(tabs),
      ...createSellpiaProfit(tabs),
      ...createSellpiaManualMatch(tabs)
    };
  }
  registerSite({ name: "sellpia", opensOwnTabs: true, create: (deps) => createSellpiaSite(deps.tabs) });

  // extensions/src/sites/tiktok-cc/index.ts
  var NAVIGATION_TIMEOUT_MS10 = 35e3;
  var EXTRACTION_TIMEOUT_MS5 = 25e3;
  var BASE_URLS = {
    hashtag: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
    product: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en",
    keyword: "https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en"
  };
  var TIKTOK_CC_PAGE_GUARD = {
    allows: (url) => hostWithin(url, ["ads.tiktok.com"]),
    isLogin: (url) => hostWithin(url, ["passport.tiktok.com"]) || /(?:\/login|\/passport|\/signup)/i.test(url.pathname),
    loginMessage: "TikTok \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 TikTok \uD0ED\uC5D0\uC11C \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694."
  };
  var CONTENT_FILES2 = {
    isolated: ["content/sourcing/tiktok-cc-extractor.js", "content/sourcing/tiktok-cc-content.js"],
    main: ["content/sourcing/tiktok-cc-hook.js"]
  };
  var TIKTOK_CC_SITE = {
    name: "tiktok",
    origin: "https://ads.tiktok.com",
    caller: { minIntervalMs: 0, displayName: "TikTok" }
  };
  function tiktokTargetFor(targetId) {
    if (targetId === "hashtag" || targetId === "product") {
      return { id: targetId, trendType: targetId, url: BASE_URLS[targetId], sourceKeyword: null };
    }
    const keyword2 = targetId.startsWith("keyword:") ? targetId.slice("keyword:".length) : targetId;
    return { id: targetId, trendType: "keyword", url: `${BASE_URLS.keyword}?keyword=${encodeURIComponent(keyword2)}`, sourceKeyword: keyword2 };
  }
  function isTiktokBlockedUrl(value) {
    try {
      return /(?:\/login|\/passport|\/signup)/i.test(new URL(value).pathname);
    } catch {
      return false;
    }
  }
  function isTiktokVerificationUrl(value) {
    try {
      const url = new URL(value);
      return /(?:verify|captcha)/i.test(url.pathname) || url.searchParams.has("captcha");
    } catch {
      return false;
    }
  }
  var SITE_VERIFICATION_REQUIRED6 = "SITE_VERIFICATION_REQUIRED";
  var MAX_VERIFICATION_ROUNDS3 = 5;
  function sanitizeTiktokRegion(value) {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/[^A-Za-z]/g, "").toUpperCase();
    return cleaned.length >= 2 && cleaned.length <= 8 ? cleaned : null;
  }
  function createTiktokCcSite(tabs) {
    let page = null;
    let keepOpen = false;
    return {
      targetFor: tiktokTargetFor,
      async target(target, defaultRegion, options = {}) {
        page ??= await tabs.open("about:blank");
        try {
          return await readTarget(page, target, defaultRegion, options.onAttention);
        } catch (error) {
          if (leftForOperator(error)) keepOpen = true;
          throw error;
        }
      },
      async close() {
        if (!keepOpen) await page?.close();
        page = null;
      }
    };
    async function readTarget(page2, target, defaultRegion, onAttention) {
      const stopAt = (url) => isTiktokBlockedUrl(url) || isTiktokVerificationUrl(url);
      let landed = await page2.navigate(target.url, { timeoutMs: NAVIGATION_TIMEOUT_MS10, stopAt, continueOnTimeout: true });
      for (let round = 1; isTiktokVerificationUrl(landed) && !isTiktokBlockedUrl(landed); round += 1) {
        const cleared = round <= MAX_VERIFICATION_ROUNDS3 && await waitForOperator(page2, isTiktokVerificationUrl, { kind: "verification", site: "TikTok", label: target.id }, onAttention);
        if (!cleared) {
          keepOpen = true;
          throw new RuntimeError(SITE_VERIFICATION_REQUIRED6, "TikTok\uC774 \uAC80\uC99D\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 TikTok \uD0ED\uC5D0\uC11C \uAC80\uC99D\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url: landed, target: target.id });
        }
        landed = await page2.navigate(target.url, { timeoutMs: NAVIGATION_TIMEOUT_MS10, stopAt, continueOnTimeout: true });
      }
      if (isTiktokBlockedUrl(landed)) {
        throw new RuntimeError(SITE_LOGIN_REQUIRED, "TikTok \uB85C\uADF8\uC778 \uB610\uB294 \uC9C0\uC5ED \uCC28\uB2E8\uC73C\uB85C \uC218\uC9D1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { url: landed, target: target.id });
      }
      const extracted = await page2.ask(
        { type: "TRIGGER_TIKTOK_CC_EXTRACT", trendType: target.trendType, sourceKeyword: target.sourceKeyword, defaultRegion },
        { timeoutMs: EXTRACTION_TIMEOUT_MS5, inject: CONTENT_FILES2, guard: TIKTOK_CC_PAGE_GUARD }
      );
      if (!extracted.ok) {
        throw new RuntimeError(SITE_REQUEST_FAILED, `TikTok \uD2B8\uB80C\uB4DC '${target.id}'\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${extracted.error ?? "\uC54C \uC218 \uC5C6\uC74C"}`, { status: null, target: target.id });
      }
      return {
        region: sanitizeTiktokRegion(extracted.region),
        items: (Array.isArray(extracted.items) ? extracted.items : []).filter((item) => Boolean(item) && typeof item === "object")
      };
    }
  }
  registerSite({ name: TIKTOK_CC_SITE.name, create: (deps) => createTiktokCcSite(deps.tabs) });

  // extensions/src/sites/wing/parse.ts
  var MAX_ATTRIBUTES_PER_OPTION = 100;
  var MAX_MEDIA_PER_OWNER = 100;
  var MAX_DOCUMENTS_PER_PRODUCT = 2e3;
  var MAX_DOCUMENT_BYTES = 64 * 1024;
  var MAX_RAW_BYTES = 64 * 1024;
  var MAX_PRODUCT_BYTES = 512 * 1024;
  var WING_CATALOG_PAGE_SIZE = 500;
  var WingPayloadError = class extends Error {
    constructor(message, code = "WING_CATALOG_PAYLOAD_INVALID") {
      super(message);
      this.code = code;
      this.name = "WingPayloadError";
    }
    code;
  };
  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    return `{${Object.entries(value).filter(([, nested]) => nested !== void 0).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`;
  }
  var encoder2 = new TextEncoder();
  function jsonByteLength(value) {
    return encoder2.encode(stableStringify(value)).byteLength;
  }
  function assertJsonBytes(value, maxBytes, message) {
    const bytes = jsonByteLength(value);
    if (bytes > maxBytes) throw new WingPayloadError(`${message} (${bytes}/${maxBytes} bytes)`, "WING_CATALOG_PAYLOAD_TOO_LARGE");
    return value;
  }
  function buildWingCatalogSearchBody(page) {
    return {
      ...searchBase(),
      displayDeletedProduct: false,
      countPerPage: WING_CATALOG_PAGE_SIZE,
      page: requiredPositiveInteger(page, "Wing \uD398\uC774\uC9C0")
    };
  }
  function buildWingProductIdSearchBody(ids, displayDeletedProduct) {
    if (ids.length === 0 || ids.length > 100) throw new WingPayloadError("Wing \uC0C1\uD488 ID \uAC80\uC0C9\uC740 1~100\uAC1C\uC785\uB2C8\uB2E4");
    return {
      ...searchBase(),
      searchKeywordType: "PRODUCT_ID",
      searchKeywords: ids.join(","),
      displayDeletedProduct,
      countPerPage: WING_CATALOG_PAGE_SIZE,
      page: 1
    };
  }
  function searchBase() {
    return {
      searchKeywordType: "ALL",
      searchKeywords: "",
      salesMethod: "ALL",
      productStatus: ["ALL"],
      stockSearchType: "ALL",
      shippingFeeSearchType: "ALL",
      displayCategoryCodes: [],
      listingStartTime: null,
      listingEndTime: null,
      saleEndDateSearchType: "ALL",
      bundledShippingSearchType: "ALL",
      shippingMethod: "ALL",
      exposureStatus: "ALL",
      sortMethod: "SORT_BY_ITEM_LEVEL_UNIT_SOLD",
      locale: "ko_KR",
      coupangAttributeOptimized: false,
      upBundleSearchOption: "ALL",
      exposureStatuses: [],
      qualityEnhanceTypes: []
    };
  }
  function normalizeWingCatalogSearchResponse(payload, page, expectedVendorId) {
    const requestedPage = requiredPositiveInteger(page, "Wing \uD398\uC774\uC9C0");
    if (!isRecord2(payload)) throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D API \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
    if (Object.hasOwn(payload, "success") && (payload.success !== true || payload.message !== null)) {
      throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D API \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
    }
    const data = payload.data;
    const pagination = isRecord2(data) ? data.pagination : void 0;
    const productList = isRecord2(data) ? data.productList : void 0;
    if (!isRecord2(data) || !Array.isArray(productList) || !isRecord2(pagination)) {
      throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D API \uB370\uC774\uD130\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
    }
    const responsePage = requiredPositiveInteger(pagination.page, "Wing \uC751\uB2F5 \uD398\uC774\uC9C0");
    const pageSize = requiredPositiveInteger(pagination.countPerPage, "Wing \uC751\uB2F5 \uD398\uC774\uC9C0 \uD06C\uAE30");
    const totalItems = requiredNonNegativeInteger(pagination.totalCount, "Wing \uC804\uCCB4 \uC0C1\uD488 \uC218");
    const totalPages = requiredNonNegativeInteger(pagination.totalPages, "Wing \uC804\uCCB4 \uD398\uC774\uC9C0 \uC218");
    if (responsePage !== requestedPage || pageSize !== WING_CATALOG_PAGE_SIZE) {
      throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D API \uD398\uC774\uC9C0 \uC815\uBCF4\uAC00 \uC694\uCCAD\uACFC \uB2E4\uB985\uB2C8\uB2E4");
    }
    const expectedPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    if (totalPages !== expectedPages) throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D API \uD398\uC774\uC9C0 \uC218\uAC00 \uC804\uCCB4 \uC0C1\uD488 \uC218\uC640 \uB2E4\uB985\uB2C8\uB2E4");
    if (totalItems === 0) {
      if (requestedPage !== 1 || productList.length !== 0) throw new WingPayloadError("Wing \uBE48 \uC0C1\uD488 \uBAA9\uB85D API \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
    } else {
      if (requestedPage > totalPages) throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D API \uD398\uC774\uC9C0\uAC00 \uBC94\uC704\uB97C \uBC97\uC5B4\uB0AC\uC2B5\uB2C8\uB2E4");
      const expectedRows = Math.min(pageSize, totalItems - (requestedPage - 1) * pageSize);
      if (productList.length !== expectedRows) {
        throw new WingPayloadError(`Wing ${requestedPage}\uD398\uC774\uC9C0 \uC0C1\uD488 \uC218\uAC00 \uBD88\uC644\uC804\uD569\uB2C8\uB2E4 (${productList.length}/${expectedRows})`);
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const products = productList.map((row) => {
      if (!isRecord2(row)) throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D \uD589\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
      if (!Number.isSafeInteger(row.vendorInventoryId) || row.vendorInventoryId <= 0) {
        throw new WingPayloadError("Wing \uC0C1\uD488 ID\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
      }
      const externalProductId = String(row.vendorInventoryId);
      if (seen.has(externalProductId)) throw new WingPayloadError(`Wing \uC0C1\uD488 ID\uAC00 \uC911\uBCF5\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${externalProductId}`);
      seen.add(externalProductId);
      if (row.vendorId !== void 0 && (typeof row.vendorId !== "string" || expectedVendorId && row.vendorId !== expectedVendorId)) {
        throw new WingPayloadError(`Wing \uD310\uB9E4\uC790 ID\uAC00 \uC218\uC9D1 \uACC4\uC815\uACFC \uB2E4\uB985\uB2C8\uB2E4: ${externalProductId}`);
      }
      requiredText5(row.productName, "Wing \uC0C1\uD488\uBA85");
      return buildCatalogBasicProduct(row);
    });
    return { page: requestedPage, pageSize, totalItems, totalPages, products };
  }
  function buildCatalogBasicProduct(inventoryProduct) {
    if (!isRecord2(inventoryProduct)) throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D \uD589\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
    const externalProductId = strictRequiredId(inventoryProduct.vendorInventoryId, "vendorInventoryId");
    const items = Array.isArray(inventoryProduct.vendorInventoryItems) ? inventoryProduct.vendorInventoryItems : [];
    if (items.length === 0) throw new WingPayloadError(`Wing \uC0C1\uD488 ${externalProductId}\uC5D0 vendorInventoryItems\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4`);
    const saleStatus = saleStatusFromWingProductStatus(requiredText5(inventoryProduct.productStatus, "Wing \uD310\uB9E4 \uC0C1\uD0DC"));
    const optionIds = /* @__PURE__ */ new Set();
    const options = items.map((item) => {
      const option = buildCatalogBasicOption(item);
      if (optionIds.has(option.externalOptionId)) {
        throw new WingPayloadError(`Wing \uC0C1\uD488 ${externalProductId} \uC635\uC158 identity conflict: ${option.externalOptionId}`);
      }
      optionIds.add(option.externalOptionId);
      return option;
    });
    const primary = normalizeImageUrl(inventoryProduct.representativeImage);
    const raw = assertJsonBytes({
      source: "wing_inventory_list",
      vendorInventoryId: externalProductId,
      productStatus: nullableText(inventoryProduct.productStatus),
      saleStatus,
      categoryName: nullableText(inventoryProduct.categoryName),
      displayCategoryCode: optionalId(inventoryProduct.displayCategoryCode),
      categoryId: optionalId(inventoryProduct.categoryId),
      manufacture: nullableText(inventoryProduct.manufacture),
      brand: nullableText(inventoryProduct.brand),
      saleDates: inventoryProduct.saleDates ?? null,
      createdOn: nullableText(inventoryProduct.createdOn),
      modifiedOn: nullableText(inventoryProduct.modifiedOn),
      itemCount: items.length
    }, MAX_RAW_BYTES, `Wing \uAE30\uBCF8 \uC0C1\uD488 ${externalProductId} raw \uB370\uC774\uD130\uAC00 \uD5C8\uC6A9 \uD06C\uAE30\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`);
    const productName = nullableText(inventoryProduct.productName)?.replace(/\s+/g, " ") ?? null;
    return assertJsonBytes({
      externalProductId,
      registeredName: productName,
      displayName: productName,
      category: nullableText(inventoryProduct.categoryName) ?? categoryCode(inventoryProduct),
      manufacturer: nullableText(inventoryProduct.manufacture),
      brand: nullableText(inventoryProduct.brand),
      // 공급자 코드는 productStatus에 두고, 판매 상태 라벨은 raw.saleStatus에만 둔다.
      productStatus: nullableText(inventoryProduct.productStatus),
      options,
      media: primary ? [{ sourceUrl: primary, role: "primary", sortOrder: 0, externalOptionId: null }] : [],
      raw
    }, MAX_PRODUCT_BYTES, `Wing \uAE30\uBCF8 \uC0C1\uD488 ${externalProductId}\uAC00 \uD5C8\uC6A9 \uD06C\uAE30\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`);
  }
  function buildCatalogBasicOption(item) {
    if (!isRecord2(item)) throw new WingPayloadError("Wing vendorInventoryItem \uD589\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
    const externalOptionId = requiredOptionId(item, "basic");
    const vendorItemId = strictOptionalId(item.vendorItemId, "vendorItemId");
    const vendorInventoryItemId = strictRequiredId(item.vendorInventoryItemId, "vendorInventoryItemId");
    const skuId = strictOptionalId(item.skuId, "skuId");
    const soldOut = strictNullableBoolean(item.soldOut, "soldOut");
    const raw = assertJsonBytes({
      vendorInventoryItemId,
      vendorItemId,
      skuId,
      itemName: nullableText(item.itemName),
      externalSkuCode: nullableText(item.externalSkuCode),
      barcode: nullableText(item.barcode),
      status: nullableText(item.status),
      soldOut,
      qcOperationStatus: nullableText(item.qcOperationStatus),
      approvalStatus: nullableText(item.approvalStatus),
      stockQuantity: nullableInteger(item.stockQuantity),
      salePrice: nullableInteger(item.salePrice),
      autoPricingActive: strictNullableBoolean(item.autoPricingActive, "autoPricingActive"),
      exposureStatuses: item.exposureStatuses ?? null,
      externalOptionIdentitySource: vendorItemId ? "vendor_item" : "inventory_item"
    }, MAX_RAW_BYTES, `Wing \uAE30\uBCF8 \uC635\uC158 ${externalOptionId} raw \uB370\uC774\uD130\uAC00 \uD5C8\uC6A9 \uD06C\uAE30\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`);
    return {
      externalOptionId,
      optionName: nullableText(item.itemName),
      skuStatus: nullableText(item.status || item.approvalStatus),
      salePrice: nullableInteger(item.salePrice),
      sellerSku: nullableText(item.externalSkuCode),
      modelNumber: null,
      barcode: nullableText(item.barcode),
      stock: nullableInteger(item.stockQuantity),
      stockQuantity: nullableInteger(item.stockQuantity),
      vendorInventoryItemId,
      vendorItemId,
      skuId,
      externalSkuCode: nullableText(item.externalSkuCode),
      soldOut,
      attributes: [],
      media: [],
      raw
    };
  }
  var DETAIL_DOCUMENT_FIELDS = [
    "contents",
    "notices",
    "additionalNotices",
    "searchTags",
    "internalAttributes",
    "certifications",
    "extraProperties"
  ];
  function buildCatalogDetailProduct(sellerProduct) {
    if (!isRecord2(sellerProduct)) throw new WingPayloadError("Wing \uC0C1\uD488 \uC0C1\uC138 JSON\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
    const externalProductId = strictRequiredId(sellerProduct.sellerProductId, "sellerProductId");
    const items = Array.isArray(sellerProduct.items) ? sellerProduct.items : [];
    if (items.length === 0) throw new WingPayloadError(`Wing \uC0C1\uD488 ${externalProductId}\uC5D0 \uC635\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4`);
    const documents = [];
    const documentByKey = /* @__PURE__ */ new Map();
    const mediaByKey = /* @__PURE__ */ new Map();
    const options = [];
    const optionIds = /* @__PURE__ */ new Set();
    for (const rawItem of items) {
      const item = isRecord2(rawItem) ? rawItem : {};
      const externalOptionId = requiredOptionId(item, "detail");
      if (optionIds.has(externalOptionId)) {
        throw new WingPayloadError(`Wing \uC0C1\uC138 \uC0C1\uD488 ${externalProductId} \uC635\uC158 identity conflict: ${externalOptionId}`);
      }
      optionIds.add(externalOptionId);
      const documentIds = [];
      for (const field of DETAIL_DOCUMENT_FIELDS) {
        if (!Object.hasOwn(item, field) || item[field] === void 0) continue;
        const value = item[field];
        const key = `${field}\0${stableStringify(value)}`;
        let document = documentByKey.get(key);
        if (!document) {
          document = { id: makeStableDocumentId(field, value, documents.length), kind: field, value };
          assertJsonBytes(document.value, MAX_DOCUMENT_BYTES, `Wing \uC0C1\uC138 \uBB38\uC11C ${field}\uAC00 \uD5C8\uC6A9 \uD06C\uAE30\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`);
          documentByKey.set(key, document);
          documents.push(document);
        }
        documentIds.push(document.id);
      }
      for (const image of Array.isArray(item.images) ? item.images : []) {
        const record2 = isRecord2(image) ? image : {};
        addDetailMedia(mediaByKey, "option", normalizeImageUrl(record2.cdnPath || record2.vendorPath), externalOptionId);
      }
      for (const sourceUrl of extractDetailImageUrls(item.contents)) {
        addDetailMedia(mediaByKey, "detail", sourceUrl, externalOptionId);
      }
      options.push({
        externalOptionId,
        sellerProductItemId: strictOptionalId(item.sellerProductItemId, "sellerProductItemId"),
        vendorItemId: strictOptionalId(item.vendorItemId, "vendorItemId"),
        externalVendorSku: nullableText(item.externalVendorSku),
        barcode: nullableText(item.barcode),
        modelNumber: nullableText(item.modelNo),
        attributes: normalizeDetailAttributes(item.attributes),
        documentIds,
        raw: buildDetailOptionRaw(item)
      });
    }
    const media = [...mediaByKey.values()].map((entry, index) => ({
      sourceUrl: entry.sourceUrl,
      role: entry.role,
      sortOrder: index,
      externalOptionIds: [...entry.externalOptionIds].sort()
    }));
    const mediaCountByOption = /* @__PURE__ */ new Map();
    for (const entry of media) {
      for (const owner of entry.externalOptionIds) {
        const count3 = (mediaCountByOption.get(owner) ?? 0) + 1;
        if (count3 > MAX_MEDIA_PER_OWNER) {
          throw new WingPayloadError(`Wing \uC0C1\uC138 \uC0C1\uD488 ${externalProductId} \uC635\uC158 ${owner}\uC758 \uBBF8\uB514\uC5B4\uAC00 \uD5C8\uC6A9 \uAC1C\uC218\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`);
        }
        mediaCountByOption.set(owner, count3);
      }
    }
    if (documents.length > MAX_DOCUMENTS_PER_PRODUCT) {
      throw new WingPayloadError(`Wing \uC0C1\uC138 \uC0C1\uD488 ${externalProductId}\uC758 \uBB38\uC11C\uAC00 \uD5C8\uC6A9 \uAC1C\uC218\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`);
    }
    const raw = assertJsonBytes({
      source: "wing_seller_product_json",
      sellerProductId: externalProductId,
      productId: optionalId(sellerProduct.productId),
      status: nullableText(sellerProduct.status),
      statusName: nullableText(sellerProduct.statusName),
      saleStartedAt: nullableText(sellerProduct.saleStartedAt),
      displayCategoryCode: optionalId(sellerProduct.displayCategoryCode),
      categoryId: optionalId(sellerProduct.categoryId),
      itemCount: items.length
    }, MAX_RAW_BYTES, `Wing \uC0C1\uC138 \uC0C1\uD488 ${externalProductId} raw \uB370\uC774\uD130\uAC00 \uD5C8\uC6A9 \uD06C\uAE30\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`);
    return assertJsonBytes(
      { externalProductId, options, documents, media, raw },
      MAX_PRODUCT_BYTES,
      `Wing \uC0C1\uC138 \uC0C1\uD488 ${externalProductId}\uAC00 \uD5C8\uC6A9 \uD06C\uAE30\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`
    );
  }
  function extractDetailImageUrls(contents) {
    const urls = [];
    for (const content of Array.isArray(contents) ? contents : []) {
      const details = isRecord2(content) && Array.isArray(content.contentDetails) ? content.contentDetails : [];
      for (const detail of details) {
        const html = String(isRecord2(detail) ? detail.content ?? "" : "");
        for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
          const url = normalizeImageUrl(match[1]);
          if (url) urls.push(url);
        }
      }
    }
    return [...new Set(urls)];
  }
  function normalizeDetailAttributes(attributes) {
    return (Array.isArray(attributes) ? attributes : []).map((attribute) => {
      const record2 = isRecord2(attribute) ? attribute : {};
      return {
        type: nullableText(record2.attributeTypeName || record2.attributeTypeId),
        value: nullableText(record2.attributeValueName)
      };
    }).filter((attribute) => Boolean(attribute.type && attribute.value)).slice(0, MAX_ATTRIBUTES_PER_OPTION);
  }
  function buildDetailOptionRaw(item) {
    return assertJsonBytes({
      ...nullableText(item.registrationType) ? { registrationType: nullableText(item.registrationType) } : {},
      sellerProductItemId: strictOptionalId(item.sellerProductItemId, "sellerProductItemId"),
      vendorItemId: strictOptionalId(item.vendorItemId, "vendorItemId"),
      itemId: strictOptionalId(item.itemId, "itemId"),
      skuId: strictOptionalId(item.skuId, "skuId"),
      externalVendorSku: nullableText(item.externalVendorSku),
      barcode: nullableText(item.barcode),
      modelNo: nullableText(item.modelNo),
      originalPrice: nullableInteger(item.originalPrice),
      salePrice: nullableInteger(item.salePrice),
      supplyPrice: nullableInteger(item.supplyPrice),
      externalOptionIdentitySource: item.vendorItemId === null || item.vendorItemId === void 0 ? "inventory_item" : "vendor_item"
    }, MAX_RAW_BYTES, "Wing \uC0C1\uC138 \uC635\uC158 raw \uB370\uC774\uD130\uAC00 \uD5C8\uC6A9 \uD06C\uAE30\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4");
  }
  function addDetailMedia(mediaByKey, role, sourceUrl, externalOptionId) {
    if (!sourceUrl) return;
    const key = `${role}:${sourceUrl}`;
    const existing = mediaByKey.get(key);
    if (existing) {
      existing.externalOptionIds.add(externalOptionId);
      return;
    }
    mediaByKey.set(key, { sourceUrl, role, externalOptionIds: /* @__PURE__ */ new Set([externalOptionId]) });
  }
  function makeStableDocumentId(field, value, ordinal) {
    const text5 = `${field}\0${stableStringify(value)}`;
    let hash = 2166136261;
    for (let index = 0; index < text5.length; index += 1) {
      hash ^= text5.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `doc:${field}:${(hash >>> 0).toString(16).padStart(8, "0")}:${ordinal}`;
  }
  function categoryCode(product) {
    const parts = [optionalId(product.displayCategoryCode), optionalId(product.categoryId)].filter(Boolean);
    return parts.length > 0 ? parts.join("/") : null;
  }
  function saleStatusFromWingProductStatus(value) {
    switch (value) {
      case "ON_SALE":
      case "PARTIAL_ON_SALE":
        return "\uD310\uB9E4\uC911";
      case "SUSPENDED":
        return "\uD310\uB9E4\uC911\uC9C0";
      case "REJECTED":
        return null;
      default:
        throw new WingPayloadError(`Wing \uD310\uB9E4 \uC0C1\uD0DC\uB97C \uD574\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${value}`);
    }
  }
  function normalizeImageUrl(value) {
    const text5 = typeof value === "string" ? value.trim() : "";
    if (!text5) return null;
    if (text5.startsWith("//")) return `https:${text5}`;
    if (/^https?:\/\//i.test(text5)) return text5;
    return `https://image1.coupangcdn.com/image/${text5.replace(/^\/+/, "")}`;
  }
  function isRecord2(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function nullableText(value) {
    if (value === null || value === void 0) return null;
    const text5 = String(value).trim();
    return text5 || null;
  }
  function optionalId(value) {
    if (value === null || value === void 0 || value === "") return null;
    return String(value);
  }
  function strictOptionalId(value, name) {
    if (value === null || value === void 0 || value === "") return null;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    throw new WingPayloadError(`Wing ${name} \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
  }
  function strictRequiredId(value, name) {
    const id = strictOptionalId(value, name);
    if (!id) throw new WingPayloadError(`Wing ${name} \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4`);
    return id;
  }
  function strictNullableBoolean(value, name) {
    if (value === null || value === void 0) return null;
    if (typeof value === "boolean") return value;
    throw new WingPayloadError(`Wing ${name} \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
  }
  function requiredOptionId(item, stage) {
    const vendorItemId = strictOptionalId(item.vendorItemId, "vendorItemId");
    if (vendorItemId) return vendorItemId;
    const relationId = stage === "basic" ? strictOptionalId(item.vendorInventoryItemId, "vendorInventoryItemId") : strictOptionalId(item.sellerProductItemId, "sellerProductItemId");
    if (relationId) return relationId;
    if (stage === "detail") {
      const itemId = strictOptionalId(item.itemId, "itemId");
      if (itemId) return itemId;
    }
    throw new WingPayloadError("Wing \uC635\uC158 \uC2DD\uBCC4\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  function nullableInteger(value) {
    if (value === null || value === void 0 || value === "") return null;
    const number2 = Number(value);
    return Number.isInteger(number2) && number2 >= 0 ? number2 : null;
  }
  function requiredText5(value, name) {
    const text5 = typeof value === "string" ? value.trim() : "";
    if (!text5) throw new WingPayloadError(`${name} \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4`);
    return text5;
  }
  function requiredPositiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new WingPayloadError(`${name} \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    return value;
  }
  function requiredNonNegativeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) throw new WingPayloadError(`${name} \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    return value;
  }

  // extensions/src/sites/wing/login.ts
  var WING_LOGIN = {
    displayName: "\uCFE0\uD321 \uC719",
    loginUrl: "https://wing.coupang.com/",
    hosts: ["wing.coupang.com", "xauth.coupang.com"],
    isLoginUrl: (url) => hostWithin(url, ["xauth.coupang.com"]) || /\/(?:login|sign-in|signin)(?:[/?#]|$)/i.test(url.pathname),
    fields: ["loginId", "password"]
  };
  function wingCallerWithLogin(caller, deps, lease) {
    const credentials = lease.credentials;
    const withLogin = createSiteLoginGate(credentials);
    const login = (page) => credentials ? ensureLoggedIn(page, WING_LOGIN, credentials, deps) : Promise.resolve({ status: "unconfirmed" });
    const gate = (call2) => lease.tabId !== null ? withLogin(call2, () => login(deps.tabs.attach(lease.tabId))) : withLoginTab(withLogin, call2, () => deps.tabs.open("about:blank"), login);
    return {
      json: (url, init) => gate(() => caller.json(url, init)),
      text: (url, init) => gate(() => caller.text(url, init)),
      bytes: (url, init) => gate(() => caller.bytes(url, init))
    };
  }

  // extensions/src/sites/wing/index.ts
  var ORIGIN5 = "https://wing.coupang.com";
  var SEARCH_URL = `${ORIGIN5}/tenants/seller-web/v2/vendor-inventory/search`;
  var DETAIL_URL = `${ORIGIN5}/tenants/seller-web/v2/vendor-inventory/seller-product/`;
  var EXCEL_BASE = `${ORIGIN5}/tenants/seller-web/excel/request/download`;
  var EXCEL_REQUEST_TYPE = "EDITABLE_CATALOGUE";
  var CATALOGUE_TYPES = [
    "DISPLAY_PRODUCT_NAME",
    "MANUFACTURE",
    "BRAND",
    "SEARCH_TAG",
    "ADULT_ONLY",
    "EXPOSE_ATTRIBUTE",
    "NON_EXPOSE_ATTRIBUTE",
    "MODEL_NO",
    "BARCODE"
  ];
  var READ_RETRY_DELAYS_MS = [2e3, 6e3];
  var NOT_FOUND = /* @__PURE__ */ Symbol("wing-not-found");
  var WING_TIMEOUT_MS = 3e4;
  var WING_DELETED_STATUS = "DELETED";
  var CATALOG_LIST_INCOMPLETE2 = "CATALOG_LIST_INCOMPLETE";
  var CATALOG_EXCEL_FAILED2 = "CATALOG_EXCEL_FAILED";
  var WING_CATALOG_PAYLOAD_INVALID = "WING_CATALOG_PAYLOAD_INVALID";
  var WING_SITE = {
    name: "wing",
    origin: ORIGIN5,
    caller: {
      minIntervalMs: 2e3,
      timeoutMs: WING_TIMEOUT_MS,
      displayName: "\uCFE0\uD321 \uC719",
      xsrf: { cookieUrl: ORIGIN5, cookieName: "XSRF-TOKEN", headerName: "X-XSRF-TOKEN" }
    }
  };
  function createWingSite(caller, deps) {
    async function readJson(url, init, notFoundIsAnswer = false) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await caller.json(url, init);
        } catch (error) {
          const failed6 = isRuntimeError(error) && error.code === SITE_REQUEST_FAILED;
          if (failed6 && notFoundIsAnswer && error.details?.status === 404) return NOT_FOUND;
          const delay = READ_RETRY_DELAYS_MS[attempt];
          if (!failed6) throw error;
          if (delay === void 0) throw withResponseHint(error);
          await deps.sleep(delay);
        }
      }
    }
    const postJson = (url, body, requireXsrf = false) => caller.json(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      requireXsrf
    });
    const searchJson = (body) => readJson(SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    });
    async function productIdsOf(ids, displayDeletedProduct) {
      const response = await searchJson(buildWingProductIdSearchBody(ids, displayDeletedProduct));
      const rows = productRows(response);
      return new Map(rows.map((row) => [String(row.vendorInventoryId), typeof row.productStatus === "string" ? row.productStatus : null]));
    }
    return {
      /** 목록 한 페이지(500개). 페이지 모양·행 수가 pagination과 맞지 않으면 `CATALOG_LIST_INCOMPLETE`. */
      async searchInventory(page, vendorId2) {
        const response = await searchJson(buildWingCatalogSearchBody(page));
        try {
          return normalizeWingCatalogSearchResponse(response, page, vendorId2);
        } catch (error) {
          if (error instanceof WingPayloadError) throw new RuntimeError(CATALOG_LIST_INCOMPLETE2, error.message, { page });
          throw error;
        }
      },
      /**
       * 상품 상세 하나. 없으면(404) null. 2xx JSON이 아니면 2초·6초 뒤 다시 묻고, 그래도 안 되면 `SITE_REQUEST_FAILED`
       * (details `status`·`reason`·`bodyHead`)를 넘긴다 — 건너뛸지는 수집기가 정한다.
       */
      async productDetail(externalProductId) {
        const body = await readJson(`${DETAIL_URL}${encodeURIComponent(externalProductId)}`, void 0, true);
        if (body === NOT_FOUND) return null;
        let product;
        try {
          product = buildCatalogDetailProduct(body);
        } catch (error) {
          if (error instanceof WingPayloadError) throw new RuntimeError(error.code, error.message, { externalProductId });
          throw error;
        }
        if (product.externalProductId !== externalProductId) {
          throw new RuntimeError(WING_CATALOG_PAYLOAD_INVALID, `Wing \uC0C1\uC138 \uC0C1\uD488 ID\uAC00 \uB2E4\uB985\uB2C8\uB2E4(${externalProductId} / ${product.externalProductId}).`);
        }
        return product;
      },
      /**
       * 목록에서 사라진 상품(최대 100개)이 삭제됐는가(KID-351 실측): `PRODUCT_ID` 검색을 삭제 상품만(`displayDeletedProduct:
       * true`) 한 번, 남은 것을 일반 상품으로 한 번 묻는다. 삭제 검색에 나오면 deleted, 일반 검색에 나오면 present, 둘 다
       * 없으면 not_found(미확인 — 서버는 활성으로 두고 품질 보고에 남긴다).
       */
      async probeDeleted(externalProductIds) {
        const found = await productIdsOf(externalProductIds, true);
        const deleted = new Map([...found].filter(([, status]) => status === WING_DELETED_STATUS));
        const liveFromDeletedSearch = new Set([...found.keys()].filter((id) => !deleted.has(id)));
        const rest = externalProductIds.filter((id) => !found.has(id));
        const present = rest.length > 0 ? await productIdsOf(rest, false) : /* @__PURE__ */ new Map();
        for (const id of liveFromDeletedSearch) present.set(id, null);
        return externalProductIds.map((externalProductId) => {
          if (deleted.has(externalProductId)) return { externalProductId, outcome: "deleted", productStatus: deleted.get(externalProductId) ?? null };
          if (present.has(externalProductId)) return { externalProductId, outcome: "present", productStatus: null };
          return { externalProductId, outcome: "not_found", productStatus: null };
        });
      },
      /**
       * [쿠팡상품정보] 엑셀(EDITABLE_CATALOGUE) 생성 요청 — 사용자가 허용한 유일한 몰 쓰기 요청(KID-351, 2026-09-24 20:32).
       * 전체 목록 조건을 그대로 쓰므로 먼저 전체 상품 수를 읽는다.
       */
      async requestCatalogExcel(description) {
        const condition = buildWingCatalogSearchBody(1);
        const totalCount = totalCountOf(await postJson(SEARCH_URL, condition));
        const response = await postJson(`${EXCEL_BASE}/create/vendor-inventory/all`, {
          searchCondition: { ...condition, totalCount },
          comment: "KidItem \uCFE0\uD321\uC0C1\uD488\uC815\uBCF4 \uAC31\uC2E0",
          fileDescription: description,
          requestType: EXCEL_REQUEST_TYPE,
          selectedTypes: [...CATALOGUE_TYPES]
        }, true);
        const record2 = asRecord(response);
        if (record2?.success !== true) {
          const message = typeof record2?.message === "string" && record2.message ? `: ${record2.message}` : "";
          throw new RuntimeError(CATALOG_EXCEL_FAILED2, `\uCFE0\uD321 \uC719\uC774 \uC0C1\uD488\uC815\uBCF4 \uC5D1\uC140 \uC0DD\uC131\uC744 \uAC70\uC808\uD588\uC2B5\uB2C8\uB2E4${message}`);
        }
      },
      /** 다운로드 목록에서 이 설명으로 만든 요청. 아직 없으면 null. 중단된 요청은 `ABORTED`. */
      async catalogExcelRequest(description) {
        const response = await caller.json(`${EXCEL_BASE}/list?requestType=${EXCEL_REQUEST_TYPE}&page=1&countPerPage=10`, {
          headers: { accept: "application/json" },
          requireXsrf: true
        });
        const rows = asRecord(response)?.result;
        const row = Array.isArray(rows) ? rows.map(asRecord).find((candidate) => candidate?.fileDescription === description && candidate.isDeleted !== "Y") : void 0;
        if (!row) return null;
        return {
          id: String(row.sellerRequestDownloadExcelId),
          status: row.isAbort === "Y" ? "ABORTED" : String(row.status ?? ""),
          executeCount: Number(row.executeCount) || 0,
          totalCount: Number(row.totalCount) || 0
        };
      },
      downloadCatalogExcel(id) {
        return caller.bytes(
          `${EXCEL_BASE}/file?requestType=${EXCEL_REQUEST_TYPE}&sellerRequestDownloadExcelId=${encodeURIComponent(id)}&sellerRequestDownloadExcelFileId=`,
          { requireXsrf: true }
        );
      },
      /** 폴링 사이 기다림. 취소되면 바로 돌아온다. */
      pause(ms, signal) {
        return new Promise((resolve) => {
          if (signal.aborted) return resolve();
          const timer = setTimeout(done, ms);
          function done() {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
          }
          signal.addEventListener("abort", done, { once: true });
        });
      }
    };
  }
  function withResponseHint(error) {
    const status = error.details?.status;
    const bodyHead = error.details?.bodyHead;
    const hint = `status ${typeof status === "number" ? status : "\uC5C6\uC74C"}${typeof bodyHead === "string" && bodyHead ? ` \xB7 ${bodyHead}` : ""}`;
    return new RuntimeError(error.code, `${error.message} \u2014 ${hint}`, error.details, error);
  }
  function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  function productRows(response) {
    const data = asRecord(asRecord(response)?.data);
    const list = data?.productList;
    if (!Array.isArray(list)) throw new RuntimeError(WING_CATALOG_PAYLOAD_INVALID, "Wing \uC0C1\uD488 \uAC80\uC0C9 \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    return list.map((row) => asRecord(row) ?? {});
  }
  function totalCountOf(response) {
    const total = asRecord(asRecord(asRecord(response)?.data)?.pagination)?.totalCount;
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new RuntimeError(WING_CATALOG_PAYLOAD_INVALID, "Wing \uC804\uCCB4 \uC0C1\uD488 \uC218\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    }
    return total;
  }
  registerSite({
    name: WING_SITE.name,
    origin: WING_SITE.origin,
    // 로그인 화면이면 실행의 저장 자격으로 한 번 로그인하고 다시 묻는다(KID-377, `./login`).
    create: (deps, lease) => createWingSite(wingCallerWithLogin(createSiteCaller(WING_SITE.caller, deps), deps, lease), { sleep: deps.sleep })
  });

  // extensions/src/sites/wing/vendor-identity.ts
  var WING_VENDOR_IDENTITY_UNAVAILABLE = "WING_VENDOR_IDENTITY_UNAVAILABLE";
  var WING_VENDOR_IDENTITY_AMBIGUOUS = "WING_VENDOR_IDENTITY_AMBIGUOUS";
  var ID = "([A-Za-z0-9][A-Za-z0-9_-]{0,79})";
  var INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  var SCRIPT_VENDOR_ID = new RegExp(`["']?vendorId["']?\\s*[:=]\\s*["']${ID}["']`, "g");
  var LABELED_VENDOR_ID = new RegExp(`\uC5C5\uCCB4\uCF54\uB4DC[\\s:]*${ID}`, "g");
  var DATA_VENDOR_ID = new RegExp(`data-vendor-id\\s*=\\s*["']${ID}["']`, "g");
  function wingVendorIdsInPage(html) {
    const found = /* @__PURE__ */ new Set();
    for (const script of html.matchAll(INLINE_SCRIPT)) {
      for (const match of (script[1] ?? "").matchAll(SCRIPT_VENDOR_ID)) found.add(match[1]);
    }
    const text5 = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
    for (const match of text5.matchAll(LABELED_VENDOR_ID)) found.add(match[1]);
    for (const match of html.matchAll(DATA_VENDOR_ID)) found.add(match[1]);
    return [...found];
  }
  async function readWingVendorId(caller, pageUrl) {
    const html = await caller.text(pageUrl, { method: "GET", headers: { Accept: "text/html" } });
    const candidates = wingVendorIdsInPage(html);
    if (candidates.length === 0) {
      throw new RuntimeError(WING_VENDOR_IDENTITY_UNAVAILABLE, "Wing \uB85C\uADF8\uC778 \uACC4\uC815\uC758 \uC5C5\uCCB4\uCF54\uB4DC\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. Wing\uC744 \uC0C8\uB85C \uACE0\uCE5C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", { url: pageUrl });
    }
    if (candidates.length > 1) {
      throw new RuntimeError(WING_VENDOR_IDENTITY_AMBIGUOUS, "Wing \uD654\uBA74\uC5D0 \uC5C5\uCCB4\uCF54\uB4DC\uAC00 \uC5EC\uB7EC \uAC1C \uBCF4\uC5EC \uB85C\uADF8\uC778 \uACC4\uC815\uC744 \uD655\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { url: pageUrl, candidates: candidates.length });
    }
    return candidates[0];
  }

  // extensions/src/sites/wing/itemwinner.ts
  var WING_ORIGIN = "https://wing.coupang.com";
  var WING_ITEMWINNER_URL = `${WING_ORIGIN}/tenants/seller-price-management/getProductList`;
  var WING_ITEMWINNER_PAGE_URL = `${WING_ORIGIN}/tenants/seller-price-management`;
  var PAGE_SIZE2 = 1e3;
  var EMPTY_PAGE_SIZE = 10;
  var WING_ITEMWINNER_CALLER = {
    minIntervalMs: 1e3,
    timeoutMs: 3e4,
    displayName: "\uCFE0\uD321 \uC719",
    xsrf: { cookieUrl: WING_ORIGIN, cookieName: "XSRF-TOKEN", headerName: "X-XSRF-TOKEN" }
  };
  var WING_ITEMWINNER_PAGE_LIMIT_REACHED = "RUNTIME_PAGE_LIMIT_REACHED";
  function requestBody() {
    return {
      searchIds: "",
      sortType: "MY_VI_SALES_DESC",
      keywords: "",
      revamp: "B",
      displayCategoryIds: [],
      productName: "",
      brandName: "",
      alarmStatus: "ALL",
      autoPriceStatus: "ALL",
      vendorItemStatus: "ON_SALE",
      itemWinnerStatus: "ALL",
      rodBadge: "ALL",
      pageSize: PAGE_SIZE2,
      page: 0,
      searchPresets: null,
      isTopGMV: null
    };
  }
  async function readWingItemwinnerList(caller) {
    const body = await caller.json(WING_ITEMWINNER_URL, {
      method: "POST",
      requireXsrf: true,
      headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
      body: JSON.stringify(requestBody())
    });
    if (!isRecord3(body) || !Array.isArray(body.result)) throw failed4("wing_itemwinner_response_invalid", "Wing \uC544\uC774\uD15C\uC704\uB108 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    const totalSize = integer(body.totalSize);
    const pageIndex = integer(body.page);
    const pageSize = integer(body.pageSize);
    const totalPages = integer(body.totalPages);
    if (totalSize === null || pageIndex !== 0 || pageSize === null || totalPages === null || totalSize < 0 || totalPages < 0) {
      throw failed4("wing_itemwinner_response_invalid", "Wing \uC544\uC774\uD15C\uC704\uB108 \uC751\uB2F5 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
    if (totalSize > WING_ITEMWINNER_MAX_ITEMS) {
      throw new RuntimeError(WING_ITEMWINNER_PAGE_LIMIT_REACHED, `\uD310\uB9E4\uC911 \uC0C1\uD488\uC774 ${WING_ITEMWINNER_MAX_ITEMS}\uAC1C\uB97C \uB118\uC5B4 \uC544\uC774\uD15C\uC704\uB108\uB97C \uD55C \uBC88\uC5D0 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { totalSize });
    }
    const rows = body.result;
    const complete = totalSize === 0 ? rows.length === 0 && totalPages === 0 && pageSize === EMPTY_PAGE_SIZE : pageSize === PAGE_SIZE2 && totalPages === 1 && rows.length === totalSize;
    if (!complete) throw failed4("wing_itemwinner_partial", "Wing \uC544\uC774\uD15C\uC704\uB108 \uBAA9\uB85D\uC774 \uD55C \uBC88\uC5D0 \uC624\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", { totalSize, rows: rows.length, totalPages });
    const normalized = rows.map(normalizeRow);
    if (new Set(normalized.map((row) => row.vendorItemId)).size !== normalized.length) {
      throw failed4("wing_itemwinner_duplicate", "Wing \uC544\uC774\uD15C\uC704\uB108 \uC751\uB2F5\uC5D0 \uAC19\uC740 \uC0C1\uD488\uC774 \uB450 \uBC88 \uC788\uC2B5\uB2C8\uB2E4.", { totalSize });
    }
    return { rows: normalized, totalSize };
  }
  function normalizeRow(value) {
    if (!isRecord3(value) || typeof value.winnerStatus !== "boolean" || typeof value.suppressed !== "boolean") throw rowInvalid("winnerStatus");
    const vendorItemId = positiveId(value.vendorItemId);
    if (!vendorItemId) throw rowInvalid("vendorItemId");
    const productName = typeof value.productName === "string" ? value.productName.trim() : "";
    if (!productName) throw rowInvalid("productName");
    const myPrice = integer(value.currentPrice);
    const winnerPrice = integer(value.winnerPrice);
    const salesQty = value.myViSales === "" ? 0 : integer(value.myViSales);
    if (myPrice === null) throw rowInvalid("currentPrice");
    if (winnerPrice === null) throw rowInvalid("winnerPrice");
    if (salesQty === null || salesQty < 0) throw rowInvalid("myViSales");
    return {
      vendorItemId,
      productName: productName.slice(0, 80),
      isWinner: value.winnerStatus && !value.suppressed,
      myPrice,
      winnerPrice,
      salesQty,
      suppressed: value.suppressed,
      providerWinnerStatus: value.winnerStatus
    };
  }
  function positiveId(value) {
    const text5 = typeof value === "number" ? Number.isSafeInteger(value) ? String(value) : "" : typeof value === "string" ? value.trim() : "";
    return /^\d+$/.test(text5) && BigInt(text5) > 0n ? text5 : null;
  }
  function integer(value) {
    const number2 = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
    return Number.isSafeInteger(number2) ? number2 : null;
  }
  function isRecord3(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function rowInvalid(field) {
    return failed4("wing_itemwinner_row_invalid", "Wing \uC544\uC774\uD15C\uC704\uB108 \uD589\uC5D0 \uD544\uC694\uD55C \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", { field });
  }
  function failed4(reason, message, details = {}) {
    return new RuntimeError(SITE_REQUEST_FAILED, message, { reason, url: WING_ITEMWINNER_URL, ...details });
  }
  function createWingItemwinnerSite(caller) {
    return {
      readVendorId: () => readWingVendorId(caller, WING_ITEMWINNER_PAGE_URL),
      readItemwinnerList: () => readWingItemwinnerList(caller)
    };
  }
  registerSite({
    name: "wing-itemwinner",
    origin: WING_ORIGIN,
    create: (deps) => createWingItemwinnerSite(createSiteCaller(WING_ITEMWINNER_CALLER, deps))
  });

  // extensions/src/sites/wing/pre-matching-search.ts
  var ORIGIN6 = "https://wing.coupang.com";
  var SEARCH_URL2 = `${ORIGIN6}/tenants/seller-web/pre-matching/search`;
  var RETRY_ATTEMPTS = 4;
  var REQUEST_TIMEOUT_MS3 = 2e4;
  var WING_SEARCH_PAYLOAD_INVALID = "WING_SEARCH_PAYLOAD_INVALID";
  var WING_SEARCH_SITE = {
    name: "wing-search",
    origin: ORIGIN6,
    caller: {
      minIntervalMs: 2200,
      displayName: "\uCFE0\uD321 \uC719",
      xsrf: { cookieUrl: ORIGIN6, cookieName: "XSRF-TOKEN", headerName: "X-XSRF-TOKEN" }
    }
  };
  function createWingPreMatchingSearch(caller, deps) {
    return {
      /** 키워드 한 페이지. 429·5xx·연결 끊김은 네 번까지 다시 묻는다. */
      async searchPage(keyword2, searchPage) {
        const body = JSON.stringify({ keyword: keyword2, excludedProductIds: [], searchPage, searchOrder: "DEFAULT", sortType: "DEFAULT" });
        for (let attempt = 1; ; attempt += 1) {
          let response;
          try {
            response = await caller.json(SEARCH_URL2, {
              requireXsrf: true,
              method: "POST",
              headers: { "content-type": "application/json", accept: "application/json, text/plain, */*" },
              body,
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS3)
            });
          } catch (error) {
            if (searchPage === 0 && isRuntimeError(error) && error.code === SITE_REQUEST_FAILED && error.details?.status === 200 && error.details?.reason === "non_json") {
              throw new RuntimeError(SITE_LOGIN_REQUIRED, `${WING_SEARCH_SITE.caller.displayName} \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`, { reason: "non_json_first_page" }, error);
            }
            const status = isRuntimeError(error) && error.code === SITE_REQUEST_FAILED ? error.details?.status : void 0;
            const retryable = status === null || status === 429 || typeof status === "number" && status >= 500;
            if (!retryable || attempt >= RETRY_ATTEMPTS) throw error;
            await deps.sleep((status === 429 ? 4e3 : 1e3) * 2 ** (attempt - 1));
            continue;
          }
          return parseWingSearchPage(response);
        }
      }
    };
  }
  function createWingCatalogSearchSite(caller, deps) {
    const search = createWingPreMatchingSearch(caller, deps);
    return {
      searchPage: search.searchPage,
      identity: (row) => `${row.productId}:${row.itemId ?? ""}:${row.vendorItemId ?? ""}`,
      toObservation: (row, keyword2, capturedAt) => row.productName.trim() ? toSourcingWingCatalogObservation(row, keyword2, capturedAt) : null
    };
  }
  function parseWingSearchPage(body) {
    const record2 = asRecord2(body);
    if (!record2 || !Array.isArray(record2.result)) {
      throw new RuntimeError(WING_SEARCH_PAYLOAD_INVALID, "Wing \uAC80\uC0C9 \uC751\uB2F5\uC758 \uBAA8\uC591\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
    const next = record2.nextSearchPage;
    return {
      rows: record2.result.map(normalizeWingSearchProduct).filter((row) => row !== null),
      nextSearchPage: typeof next === "number" && Number.isInteger(next) ? next : null
    };
  }
  function normalizeWingSearchProduct(raw) {
    const product = asRecord2(raw);
    if (!product || product.productId == null) return null;
    const productId2 = String(product.productId);
    if (!productId2) return null;
    const salePrice = nullableNumber(product.salePrice);
    const salesLast28d = nullableNumber(product.salesLast28d);
    const pvLast28Day = nullableNumber(product.pvLast28Day);
    const category = Array.isArray(product.displayCategoryInfo) ? asRecord2(product.displayCategoryInfo[0])?.categoryHierarchy : null;
    return {
      productId: productId2,
      itemId: product.itemId == null ? null : String(product.itemId),
      vendorItemId: product.vendorItemId == null ? null : String(product.vendorItemId),
      productName: String(product.productName || ""),
      itemName: product.itemName ? String(product.itemName) : null,
      brandName: product.brandName ? String(product.brandName) : null,
      manufacture: product.manufacture ? String(product.manufacture) : null,
      categoryHierarchy: typeof category === "string" && category ? category : null,
      imagePath: product.imagePath ? String(product.imagePath) : null,
      salePrice,
      rating: nullableNumber(product.rating),
      ratingCount: nullableNumber(product.ratingCount),
      pvLast28Day,
      salesLast28d,
      estimatedRevenue28d: salePrice != null && salesLast28d != null ? Math.round(salePrice * salesLast28d) : null,
      conversionRate28d: pvLast28Day != null && pvLast28Day > 0 && salesLast28d != null ? salesLast28d / pvLast28Day : null,
      deliveryInfo: product.deliveryInfo ? String(product.deliveryInfo) : null
    };
  }
  function toSourcingWingCatalogObservation(row, sourceKeyword, capturedAt) {
    return {
      productId: row.productId,
      itemId: row.itemId,
      vendorItemId: row.vendorItemId,
      productName: row.productName.slice(0, 500),
      itemName: row.itemName?.slice(0, 500) ?? null,
      brandName: row.brandName?.slice(0, 500) ?? null,
      manufacture: row.manufacture?.slice(0, 500) ?? null,
      categoryHierarchy: row.categoryHierarchy?.slice(0, 1e3) ?? null,
      imagePath: row.imagePath?.slice(0, 2e3) ?? null,
      salePriceKrw: boundedInteger2(row.salePrice),
      ratingAverage: boundedNumber2(row.rating, 0, 5),
      ratingCount: boundedInteger2(row.ratingCount),
      viewsLast28d: boundedInteger2(row.pvLast28Day),
      salesLast28d: boundedInteger2(row.salesLast28d),
      estimatedRevenue28d: boundedNumber2(row.estimatedRevenue28d, 0, 2147483647),
      conversionRate28d: boundedNumber2(row.conversionRate28d, 0, 1),
      deliveryInfo: row.deliveryInfo?.slice(0, 1e3) ?? null,
      sourceKeyword,
      capturedAt
    };
  }
  function nullableNumber(value) {
    if (value == null || typeof value === "boolean" || typeof value === "object") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  function boundedInteger2(value) {
    return value !== null && Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
  }
  function boundedNumber2(value, minimum, maximum) {
    return value !== null && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
  }
  function asRecord2(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  registerSite({
    name: WING_SEARCH_SITE.name,
    create: (deps) => createWingCatalogSearchSite(createSiteCaller(WING_SEARCH_SITE.caller, deps), { sleep: deps.sleep })
  });

  // extensions/src/sites/wing/reviews.ts
  var WING_ORIGIN2 = "https://wing.coupang.com";
  var WING_REVIEW_SEARCH_URL = `${WING_ORIGIN2}/tenants/cs/product/review/search`;
  var WING_REVIEW_PAGE_SIZE = 50;
  var WING_REVIEW_CALLER = { minIntervalMs: 350 };
  var WING_REVIEW_TIMEOUT_MS = 2e4;
  async function searchWingReviews(caller, input, options = {}) {
    const body = await caller.json(WING_REVIEW_SEARCH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs ?? WING_REVIEW_TIMEOUT_MS),
      headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: input.start.slice(0, 10),
        endTime: input.end.slice(0, 10),
        rating: "",
        salesStatus: "",
        advancedType: "productName",
        advancedInput: "",
        pageIndex: input.pageIndex,
        pageSize: WING_REVIEW_PAGE_SIZE,
        productName: ""
      })
    });
    if (body?.code !== "OK") {
      const message = typeof body?.message === "string" && body.message ? body.message : "\uC54C \uC218 \uC5C6\uB294 \uC751\uB2F5";
      throw new RuntimeError(SITE_REQUEST_FAILED, `Wing \uC0C1\uD488\uD3C9 \uC870\uD68C\uAC00 \uAC70\uC808\uB410\uC2B5\uB2C8\uB2E4: ${message}`, {
        reason: "wing_review_rejected",
        url: WING_REVIEW_SEARCH_URL
      });
    }
    const content = Array.isArray(body.data?.content) ? body.data.content : [];
    const items = content.map(normalizeWingReview).filter((item) => item !== null);
    const totalPages = Number(body.data?.pagination?.totalPages);
    return { items, totalPages: Number.isSafeInteger(totalPages) && totalPages > 0 ? totalPages : 0 };
  }
  function normalizeWingReview(value) {
    if (!value || typeof value !== "object") return null;
    const raw = value;
    if (raw.reviewId === null || raw.reviewId === void 0) return null;
    const rating = Number(raw.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
    const reviewedAt = Number(raw.reviewAt || raw.createdAt || 0);
    if (!Number.isFinite(reviewedAt) || reviewedAt <= 0) return null;
    const attachment = attachmentCounts(raw.attachment);
    return {
      externalReviewId: String(raw.reviewId),
      externalOptionId: raw.vendorItemId === null || raw.vendorItemId === void 0 ? null : String(raw.vendorItemId),
      externalProductId: raw.productId === null || raw.productId === void 0 ? null : String(raw.productId),
      itemName: text4(raw.itemName),
      rating: Math.round(rating),
      title: text4(raw.reviewTitle),
      content: text4(raw.reviewContent),
      reviewerName: text4(raw.memberName),
      reviewedAt: Math.trunc(reviewedAt),
      imageCount: attachment.images,
      videoCount: attachment.videos,
      isDeleted: raw.deleted === true,
      isBlinded: raw.blinded === true
    };
  }
  function attachmentCounts(value) {
    if (typeof value !== "string" || !value) return { images: 0, videos: 0 };
    try {
      const parsed2 = JSON.parse(value);
      return {
        images: Array.isArray(parsed2?.imageAttachments) ? parsed2.imageAttachments.length : 0,
        videos: Array.isArray(parsed2?.videoAttachments) ? parsed2.videoAttachments.length : 0
      };
    } catch {
      return { images: 0, videos: 0 };
    }
  }
  function text4(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
  }
  function createWingReviewsSite(caller) {
    return { searchReviews: (input) => searchWingReviews(caller, input) };
  }
  registerSite({
    name: "wing-reviews",
    origin: WING_ORIGIN2,
    create: (deps, lease) => createWingReviewsSite(wingCallerWithLogin(createSiteCaller(WING_REVIEW_CALLER, deps), deps, lease))
  });

  // extensions/src/sites/wing/traffic.ts
  var WING_ORIGIN3 = "https://wing.coupang.com";
  var WING_TRAFFIC_DETAIL_URL = `${WING_ORIGIN3}/tenants/rfm-ss/api/business-insight/vi-detail-search`;
  var WING_TRAFFIC_SUMMARY_URL = `${WING_ORIGIN3}/tenants/rfm-ss/api/business-insight/vendor-summary`;
  var WING_TRAFFIC_METADATA_URL = `${WING_ORIGIN3}/tenants/rfm-ss/api/metadata/business-insights`;
  var WING_TRAFFIC_PAGE_SIZE = 100;
  var WING_TRAFFIC_PAGE_URL = `${WING_ORIGIN3}/tenants/business-insight/sales-analysis`;
  var REGISTRATION_TYPES = ["NORMAL", "RFM"];
  var WING_TRAFFIC_CALLER = {
    minIntervalMs: 300,
    timeoutMs: 3e4,
    displayName: "\uCFE0\uD321 \uC719",
    xsrf: { cookieUrl: WING_ORIGIN3, cookieName: "XSRF-TOKEN", headerName: "X-XSRF-TOKEN" }
  };
  var JSON_HEADERS = { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" };
  async function readWingTrafficFreshness(caller, now) {
    const body = await caller.json(`${WING_TRAFFIC_METADATA_URL}?platform=WING&date=${encodeURIComponent(now.toISOString())}`, {
      requireXsrf: true,
      headers: { Accept: "application/json, text/plain, */*" }
    });
    const metrics = record(record(record(body)?.dataFreshness)?.metrics);
    const viewable = record(record(record(body)?.viewablePeriods)?.sa);
    const freshness = {
      salesLatest: koreaDate(record(metrics?.SALES_DAILY)?.latestDataDate),
      trafficLatest: koreaDate(record(metrics?.TRAFFIC_DAILY)?.latestDataDate),
      viewableStart: koreaDate(viewable?.startDate),
      viewableEnd: koreaDate(viewable?.endDate)
    };
    if (!freshness.salesLatest || !freshness.trafficLatest || !freshness.viewableStart || !freshness.viewableEnd) {
      throw failed5("wing_traffic_metadata_invalid", "Wing \uB9E4\uCD9C\uBD84\uC11D \uACF5\uAC1C \uAE30\uAC04 \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
    return freshness;
  }
  async function readWingTrafficDetailPage(caller, input) {
    const body = record(await caller.json(WING_TRAFFIC_DETAIL_URL, {
      method: "POST",
      requireXsrf: true,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        startDate: input.businessDate,
        endDate: input.businessDate,
        registrationTypes: [...REGISTRATION_TYPES],
        pageNumber: input.pageNumber,
        pageSize: WING_TRAFFIC_PAGE_SIZE,
        sortBy: "GMV",
        sortOrder: "DESC",
        includeSoldVICount: true
      })
    }));
    const pagination = record(body?.paginationDetails);
    const items = body?.vendorItems;
    const totalResults = integer2(pagination?.totalResults);
    const totalPages = integer2(pagination?.totalPages);
    const pageSize = integer2(pagination?.pageSize);
    const pageNumber = integer2(pagination?.pageNumber);
    if (!Array.isArray(items) || totalResults === null || totalPages === null || pageSize === null || pageNumber === null) {
      throw failed5("wing_traffic_response_invalid", "Wing \uD2B8\uB798\uD53D \uCABD \uC751\uB2F5 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { businessDate: input.businessDate, pageNumber: input.pageNumber });
    }
    return { rows: items.map((item) => normalizeRow2(item, input.vendorId)), totalResults, totalPages, pageSize, pageNumber };
  }
  async function readWingTrafficSummary(caller, input) {
    const body = record(await caller.json(WING_TRAFFIC_SUMMARY_URL, {
      method: "POST",
      requireXsrf: true,
      headers: JSON_HEADERS,
      body: JSON.stringify({ startDate: input.startDate, endDate: input.endDate, registrationTypes: [...REGISTRATION_TYPES], searchIds: [] })
    }));
    const metrics = record(body?.summaryMetrics);
    const summary = {
      visitors: integer2(metrics?.totalUniqueVisitor),
      views: integer2(metrics?.totalPageViews),
      cartAdds: integer2(metrics?.totalAddToCart),
      orders: integer2(metrics?.totalOrders),
      salesQty: integer2(metrics?.totalUnitsSold),
      revenue: integer2(metrics?.totalGmv)
    };
    if (Object.values(summary).some((value) => value === null)) {
      throw failed5("wing_traffic_summary_invalid", "Wing \uD2B8\uB798\uD53D \uC694\uC57D \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", input);
    }
    const ratio = metrics?.pvToOrder;
    const providerConversionRate = ratio === null || ratio === void 0 ? null : number(ratio);
    if (ratio !== null && ratio !== void 0 && providerConversionRate === null) {
      throw failed5("wing_traffic_summary_invalid", "Wing \uD2B8\uB798\uD53D \uC694\uC57D \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", input);
    }
    return { ...summary, providerConversionRate: providerConversionRate === null ? null : providerConversionRate * 100 };
  }
  function normalizeRow2(value, vendorId2) {
    const row = record(value);
    const details = record(row?.vendorItemDetails);
    const metrics = record(row?.businessInsightsMetricsResponse);
    const vendorItemId = positiveId2(details?.vendorItemId);
    const productId2 = positiveId2(details?.inventoryId);
    if (!details || !metrics || !vendorItemId || !productId2) throw rowInvalid2("vendorItemDetails");
    const rowVendorId = details.vendorId === null || details.vendorId === void 0 ? "" : String(details.vendorId).trim();
    if (rowVendorId !== vendorId2) {
      throw failed5("advertiser_identity_mismatch", "Wing \uACC4\uC815 \uC2DD\uBCC4\uC790\uAC00 \uC218\uC9D1 \uACC4\uD68D\uACFC \uB2E4\uB985\uB2C8\uB2E4. \uB2E4\uB978 Wing \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uD588\uB294\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.", { vendorItemId });
    }
    const values = {
      visitors: integer2(metrics.totalUniqueVisitor),
      views: integer2(metrics.totalPageViews),
      cartAdds: integer2(metrics.totalAddToCart),
      orders: integer2(metrics.totalOrders),
      salesQty: integer2(metrics.totalUnitsSold),
      revenue: integer2(metrics.totalGmv)
    };
    for (const [field, metric2] of Object.entries(values)) if (metric2 === null) throw rowInvalid2(field);
    return { vendorItemId, productId: productId2, ...values };
  }
  function koreaDate(value) {
    const timestamp = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : typeof value === "string" || typeof value === "number" ? new Date(value).getTime() : Number.NaN;
    if (!Number.isFinite(timestamp)) return null;
    return new Date(timestamp + 9 * 60 * 60 * 1e3).toISOString().slice(0, 10);
  }
  function positiveId2(value) {
    const text5 = typeof value === "number" ? Number.isSafeInteger(value) ? String(value) : "" : typeof value === "string" ? value.trim() : "";
    return /^[1-9]\d*$/.test(text5) ? text5 : null;
  }
  function number(value) {
    const parsed2 = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
    return Number.isFinite(parsed2) ? parsed2 : null;
  }
  function integer2(value) {
    const parsed2 = number(value);
    return parsed2 !== null && Number.isSafeInteger(parsed2) ? parsed2 : null;
  }
  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  function rowInvalid2(field) {
    return failed5("wing_traffic_row_invalid", "Wing \uD2B8\uB798\uD53D \uD589\uC5D0 \uD544\uC694\uD55C \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", { field });
  }
  function failed5(reason, message, details = {}) {
    return new RuntimeError(SITE_REQUEST_FAILED, message, { reason, ...details });
  }
  function createWingTrafficSite(caller) {
    return {
      readVendorId: () => readWingVendorId(caller, WING_TRAFFIC_PAGE_URL),
      readFreshness: (now) => readWingTrafficFreshness(caller, now),
      readDetailPage: (input) => readWingTrafficDetailPage(caller, input),
      readSummary: (input) => readWingTrafficSummary(caller, input)
    };
  }
  registerSite({
    name: "wing-traffic",
    origin: WING_ORIGIN3,
    create: (deps) => createWingTrafficSite(createSiteCaller(WING_TRAFFIC_CALLER, deps))
  });

  // extensions/src/core/browser.ts
  var RUNTIME_BROWSER_ALREADY_ACQUIRED = "RUNTIME_BROWSER_ALREADY_ACQUIRED";
  var RUNTIME_BROWSER_UNAVAILABLE = "RUNTIME_BROWSER_UNAVAILABLE";
  function createBrowserResources(chromeApi, sites2, options = {}) {
    const held = /* @__PURE__ */ new Set();
    return {
      async acquire({ operationId, lockKeys, site = null, signal }) {
        if (held.has(operationId)) {
          throw new RuntimeError(RUNTIME_BROWSER_ALREADY_ACQUIRED, "\uC774 \uC2E4\uD589\uC740 \uC774\uBBF8 \uBE0C\uB77C\uC6B0\uC800 \uC790\uC6D0\uC744 \uC7A1\uACE0 \uC788\uC2B5\uB2C8\uB2E4.", { operationId });
        }
        signal.throwIfAborted();
        const accountSite = site !== null && site in sites2 ? site : site !== null && options.ownTabSites?.has(site) ? null : options.accountSite ?? null;
        const siteNames = [...new Set(lockKeys.map((key) => siteOfLockKey(key, accountSite)).filter((name) => name !== null && name in sites2))];
        if (siteNames.length > 1) {
          throw new RuntimeError(RUNTIME_BROWSER_UNAVAILABLE, "\uD55C \uC2E4\uD589\uC774 \uB450 \uC0AC\uC774\uD2B8\uC758 \uD0ED\uC744 \uD568\uAED8 \uC7A1\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { sites: siteNames });
        }
        held.add(operationId);
        try {
          const tab = siteNames.length === 1 ? await openSiteTab(chromeApi, sites2[siteNames[0]].origin) : null;
          let released = false;
          return {
            tabId: tab?.tabId ?? null,
            async release(outcome = {}) {
              if (released) return;
              released = true;
              held.delete(operationId);
              if (!tab?.opened) return;
              if (operatorMustAct(outcome.error)) {
                await chromeApi.tabs.update(tab.tabId, { active: true }).catch(() => void 0);
                return;
              }
              await chromeApi.tabs.remove(tab.tabId).catch(() => void 0);
            }
          };
        } catch (error) {
          held.delete(operationId);
          throw error;
        }
      }
    };
  }
  function siteOfLockKey(key, accountSite) {
    if (key.startsWith("resource:")) return key.split(":")[1] ?? null;
    if (key.startsWith("account:")) return accountSite;
    return null;
  }
  async function openSiteTab(chromeApi, origin) {
    const base = origin.replace(/\/+$/, "");
    const [existing] = await chromeApi.tabs.query({ url: `${base}/*` });
    if (typeof existing?.id === "number") return { tabId: existing.id, opened: false };
    const created = await chromeApi.tabs.create({ url: base, active: false });
    if (typeof created.id !== "number") {
      throw new RuntimeError(RUNTIME_BROWSER_UNAVAILABLE, "\uC0AC\uC774\uD2B8 \uD0ED\uC744 \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { origin: base });
    }
    return { tabId: created.id, opened: true };
  }
  function operatorMustAct(error) {
    return isRuntimeError(error) && (error.code === SITE_LOGIN_REQUIRED || error.details?.reason === "unexpected_url");
  }

  // extensions/src/entry/site-handles.ts
  function entrySites() {
    return Object.fromEntries(registeredSites().flatMap((site) => site.origin ? [[site.name, { origin: site.origin }]] : []));
  }
  function ownTabSites() {
    return new Set(registeredSites().filter((site) => site.opensOwnTabs === true).map((site) => site.name));
  }
  var ACCOUNT_SITE = "wing";
  function createSiteHandles(deps) {
    return (kind, lease) => siteFactoryFor(collectorFor(kind)?.site ?? "")?.create(deps, lease) ?? null;
  }

  // extensions/src/entry/legacy-bridge.ts
  function legacyGlobalsPresent() {
    return typeof KidItemDomains !== "undefined" && typeof sourceOwnerEnvironmentContext !== "undefined";
  }
  function legacyKeepAlive(work) {
    if (typeof KidItemWorkerKeepAlive === "undefined" || !KidItemWorkerKeepAlive) return;
    KidItemWorkerKeepAlive.during(work).catch(() => void 0);
  }
  function legacyApiPort(environmentId) {
    return { fetch: (path, init) => sourceOwnerEnvironmentContext.authedFetch(environmentId, path, init) };
  }
  function registerWithLegacyDomains(domain) {
    KidItemDomains.register(domain);
  }

  // extensions/src/core/operation-client.ts
  function stopFor(code, details) {
    if (code === "OPERATION_IN_PROGRESS") {
      const existing = OperationInProgressDetailsSchema.safeParse(details);
      return { kind: "already_running", existing: existing.success ? existing.data : null };
    }
    if (code === "OPERATION_FENCE_LOST" || code === "OPERATION_NOT_FOUND") {
      const reason = details?.reason;
      return { kind: "fence_lost", reason: typeof reason === "string" ? reason : null };
    }
    return { kind: "report_failed" };
  }
  var RUNTIME_API_UNREACHABLE = "RUNTIME_API_UNREACHABLE";
  function createOperationClient(api) {
    const base = "/api/operations";
    return {
      begin: (request) => call(api, base, { method: "POST", body: request }, OperationBeginResponseSchema),
      async putChunk({ operationId, token, chunkKind, sequence, payload, progress: progress4 }) {
        const checksum = await sha256Hex(JSON.stringify(payload));
        return call(
          api,
          `${base}/${encodeURIComponent(operationId)}/chunks/${encodeURIComponent(chunkKind)}/${sequence}`,
          { method: "PUT", token, body: { checksum, payload, ...progress4 ? { progress: progress4 } : {} } },
          OperationChunkPutResponseSchema
        );
      },
      finish: ({ operationId, token, request }) => call(api, `${base}/${encodeURIComponent(operationId)}/finish`, { method: "POST", token, body: request }, OperationFinishResponseSchema),
      async cancel(operationId) {
        const response = await call(api, `${base}/${encodeURIComponent(operationId)}/cancel`, { method: "POST" }, OperationCancelResponseSchema);
        return response.operation;
      }
    };
  }
  async function call(api, path, request, schema) {
    const headers = { "content-type": "application/json" };
    if (request.token !== void 0) headers[OPERATION_TOKEN_HEADER] = request.token;
    let response;
    try {
      response = await api.fetch(path, {
        method: request.method,
        headers,
        ...request.body !== void 0 ? { body: JSON.stringify(request.body) } : {}
      });
    } catch (error) {
      const code = error?.code;
      if (typeof code === "string" && code.trim()) {
        const message = error instanceof Error && error.message ? error.message : "KidItem \uC11C\uBC84 \uC694\uCCAD\uC774 \uAC70\uC808\uB410\uC2B5\uB2C8\uB2E4.";
        throw new RuntimeError(code.trim().slice(0, 100), message, { path }, error);
      }
      throw new RuntimeError(RUNTIME_API_UNREACHABLE, "KidItem \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { path }, error);
    }
    const body = await response.json().catch(() => void 0);
    if (!response.ok) {
      const envelope = parseErrorEnvelope(body);
      if (!envelope) {
        throw new RuntimeError(RUNTIME_API_UNREACHABLE, "KidItem \uC11C\uBC84 \uC751\uB2F5\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { path, status: response.status });
      }
      throw new RuntimeError(envelope.code, envelope.message, envelope.details ?? null);
    }
    const parsed2 = schema.safeParse(body);
    if (!parsed2.success) {
      throw new RuntimeError(RUNTIME_API_UNREACHABLE, "KidItem \uC11C\uBC84 \uC751\uB2F5\uC774 \uC2E4\uD589 \uACC4\uC57D\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { path, status: response.status });
    }
    return parsed2.data;
  }
  async function sha256Hex(text5) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text5));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // extensions/src/core/runner.ts
  var RUNTIME_UNKNOWN_KIND = "RUNTIME_UNKNOWN_KIND";
  var RUNTIME_COLLECT_FAILED = "RUNTIME_COLLECT_FAILED";
  var RUNTIME_CHUNK_TOO_LARGE = "RUNTIME_CHUNK_TOO_LARGE";
  var HEARTBEAT_CHUNK_KIND = "heartbeat";
  var HEARTBEAT_INTERVAL_MS = OPERATION_LEASE_MS / 3;
  var encoder3 = new TextEncoder();
  function createRunner(deps, collectorFor2) {
    return {
      /**
       * 연쇄(KID-354): 성공한 실행의 `result.next`가 있으면 같은 환경으로 그 kind를 이어서 돌린다(루프, 재귀 아님).
       * 실패·거절·취소는 그 실행의 outcome으로 끝나고, 마지막 실행의 outcome을 돌려준다.
       */
      async run(input) {
        let step = input;
        for (; ; ) {
          const outcome = await runOne(deps, collectorFor2, step);
          const next = outcome.kind === "finished" && outcome.operation.status === "succeeded" ? nextOperationFrom(outcome.operation.result) : null;
          if (!next || input.signal.aborted) return outcome;
          const { idempotencyKey: _previousKey, credentials, ...rest } = step;
          const sameSite = credentials !== void 0 && (collectorFor2(next.kind)?.site ?? null) === (collectorFor2(step.kind)?.site ?? null);
          step = { ...rest, ...sameSite ? { credentials } : {}, kind: next.kind, scope: next.scope };
        }
      }
    };
  }
  async function runOne(deps, collectorFor2, input) {
    const collector = collectorFor2(input.kind);
    if (!collector) {
      return { kind: "failed", operationId: null, errorCode: RUNTIME_UNKNOWN_KIND, errorMessage: `\uC774 \uD655\uC7A5\uC774 \uBAA8\uB974\uB294 \uC2E4\uD589 \uC885\uB958\uC785\uB2C8\uB2E4: ${input.kind}` };
    }
    let begun;
    try {
      begun = await deps.client.begin({
        kind: input.kind,
        scope: input.scope,
        ...input.idempotencyKey !== void 0 ? { idempotencyKey: input.idempotencyKey } : {}
      });
    } catch (caught) {
      const error = toRuntimeError(caught, RUNTIME_COLLECT_FAILED);
      const stop = stopFor(error.code, error.details);
      if (stop.kind === "already_running") return { kind: "already_running", existing: stop.existing, message: error.message };
      return { kind: "failed", operationId: null, errorCode: error.code, errorMessage: error.message, ...error.details ? { details: error.details } : {} };
    }
    if (begun.reused) {
      const { id: operationId, kind, lockKeys, startedAt, expiresAt } = begun.operation;
      return { kind: "already_running", existing: { operationId, kind, lockKeys, startedAt, expiresAt }, reused: true };
    }
    input.onBegun?.({ operationId: begun.operation.id, reused: begun.reused });
    return execute(deps, collector, input, begun.operation, begun.token);
  }
  async function execute(deps, collector, input, operation, token) {
    const operationId = operation.id;
    const local = new AbortController();
    const onAbort = () => local.abort(input.signal.reason);
    if (input.signal.aborted) local.abort(input.signal.reason);
    else input.signal.addEventListener("abort", onAbort, { once: true });
    let writes = Promise.resolve();
    const write = (send) => {
      const next = writes.then(send);
      writes = next.catch(() => void 0);
      return next;
    };
    let lastProgress;
    let heartbeatStop = null;
    let heartbeatTimer = null;
    const stopHeartbeat = () => {
      if (heartbeatTimer !== null) clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    };
    let collectionDone = false;
    const scheduleHeartbeat = () => {
      stopHeartbeat();
      if (collectionDone || local.signal.aborted) return;
      heartbeatTimer = setTimeout(() => {
        heartbeatTimer = null;
        write(
          () => deps.client.putChunk({
            operationId,
            token,
            chunkKind: HEARTBEAT_CHUNK_KIND,
            sequence: 1,
            payload: [],
            ...lastProgress ? { progress: lastProgress } : {}
          })
        ).then(
          () => scheduleHeartbeat(),
          (caught) => {
            const error = toRuntimeError(caught, RUNTIME_COLLECT_FAILED);
            if (stopFor(error.code, error.details).kind === "fence_lost") {
              heartbeatStop = error;
              local.abort(error);
            } else {
              scheduleHeartbeat();
            }
          }
        );
      }, HEARTBEAT_INTERVAL_MS);
    };
    let lease = null;
    let failure2 = null;
    try {
      lease = await deps.browser.acquire({ operationId, lockKeys: operation.lockKeys, site: collector.site, signal: local.signal });
      const site = deps.siteFor(operation.kind, { tabId: lease.tabId, ...input.credentials ? { credentials: input.credentials } : {} });
      const sequences = /* @__PURE__ */ new Map();
      let chunks = 0;
      let items = 0;
      scheduleHeartbeat();
      const report = async (progress4) => {
        if (collectionDone || local.signal.aborted) return;
        lastProgress = progress4;
        await write(
          () => deps.client.putChunk({ operationId, token, chunkKind: HEARTBEAT_CHUNK_KIND, sequence: 1, payload: [], progress: progress4 })
        );
        scheduleHeartbeat();
      };
      for await (const chunk of collector.collect(operation.plan ?? {}, site, { signal: local.signal, tabId: lease.tabId, report })) {
        if (local.signal.aborted) break;
        if (chunk.chunkKind === HEARTBEAT_CHUNK_KIND) {
          throw new RuntimeError(RUNTIME_COLLECT_FAILED, `\uC218\uC9D1\uAE30\uB294 \uC608\uC57D\uB41C chunkKind(${HEARTBEAT_CHUNK_KIND})\uB97C \uC4F0\uC9C0 \uC54A\uB294\uB2E4.`, { reason: "reserved_chunk_kind" });
        }
        const empty = chunk.payload.length === 0;
        if (!empty) assertChunkFits(chunk, chunks);
        const next = (sequences.get(chunk.chunkKind) ?? 0) + 1;
        const sequence = empty ? Math.min(next, OPERATION_CHUNKS_MAX) : next;
        if (!empty) sequences.set(chunk.chunkKind, sequence);
        await write(
          () => deps.client.putChunk({
            operationId,
            token,
            chunkKind: chunk.chunkKind,
            sequence,
            payload: chunk.payload,
            ...chunk.progress ? { progress: chunk.progress } : {}
          })
        );
        if (!empty) {
          chunks += 1;
          items += chunk.payload.length;
        }
        if (chunk.progress) lastProgress = chunk.progress;
        scheduleHeartbeat();
      }
      collectionDone = true;
      stopHeartbeat();
      await writes;
      if (heartbeatStop) throw heartbeatStop;
      if (input.signal.aborted) return cancelled(operationId);
      const summary = collector.summarize?.({ chunks, items }) ?? {};
      const request = {
        outcome: "succeeded",
        ...summary.result ? { result: summary.result } : {},
        ...summary.window ? { window: summary.window } : {}
      };
      const finished = await deps.client.finish({ operationId, token, request });
      return { kind: "finished", operation: finished.operation };
    } catch (caught) {
      collectionDone = true;
      stopHeartbeat();
      if (!heartbeatStop && input.signal.aborted) return cancelled(operationId);
      const error = heartbeatStop ?? toRuntimeError(caught, RUNTIME_COLLECT_FAILED);
      failure2 = error;
      const stop = stopFor(error.code, error.details);
      if (stop.kind === "fence_lost") return { kind: "fence_lost", operationId, reason: stop.reason };
      await writes;
      const login = loginFailureOf(error);
      await deps.client.finish({
        operationId,
        token,
        request: {
          outcome: "failed",
          errorCode: error.code.slice(0, 64),
          errorMessage: error.message.slice(0, 2e3),
          ...login ? { result: { login } } : {}
        }
      }).catch(() => void 0);
      return { kind: "failed", operationId, errorCode: error.code, errorMessage: error.message, ...error.details ? { details: error.details } : {} };
    } finally {
      stopHeartbeat();
      local.abort();
      input.signal.removeEventListener("abort", onAbort);
      await lease?.release({ error: failure2 }).catch(() => void 0);
    }
  }
  function loginFailureOf(error) {
    if (error.code !== SITE_LOGIN_REQUIRED || typeof error.details?.reason !== "string") return null;
    const mallMessage = error.details.mallMessage;
    return {
      reason: error.details.reason.slice(0, 64),
      ...typeof mallMessage === "string" && mallMessage ? { mallMessage: mallMessage.slice(0, 300) } : {}
    };
  }
  function cancelled(operationId) {
    return { kind: "failed", operationId, errorCode: OPERATION_CANCEL_CODE, errorMessage: "\uC2E4\uD589\uC744 \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4." };
  }
  function assertChunkFits(chunk, sentChunks) {
    const bytes = encoder3.encode(JSON.stringify(chunk.payload)).byteLength;
    if (bytes > OPERATION_CHUNK_MAX_BYTES) {
      throw new RuntimeError(RUNTIME_CHUNK_TOO_LARGE, `\uCCAD\uD06C \uD558\uB098\uAC00 ${OPERATION_CHUNK_MAX_BYTES}\uBC14\uC774\uD2B8\uB97C \uB118\uC2B5\uB2C8\uB2E4.`, { chunkKind: chunk.chunkKind, bytes });
    }
    if (sentChunks >= OPERATION_CHUNKS_MAX) {
      throw new RuntimeError(RUNTIME_CHUNK_TOO_LARGE, `\uCCAD\uD06C\uAC00 ${OPERATION_CHUNKS_MAX}\uAC1C\uB97C \uB118\uC2B5\uB2C8\uB2E4.`, { chunkKind: chunk.chunkKind, reason: "too_many_chunks" });
    }
  }
  function toRuntimeError(caught, fallbackCode) {
    if (isRuntimeError(caught)) return caught;
    const message = caught instanceof Error && caught.message ? caught.message : "\uC2E4\uD589 \uC911 \uC624\uB958\uAC00 \uB0AC\uC2B5\uB2C8\uB2E4.";
    return new RuntimeError(fallbackCode, message, null, caught);
  }
  function nextOperationFrom(result) {
    const next = result?.next;
    if (next === void 0 || next === null) return null;
    const parsed2 = OperationNextSchema.safeParse(next);
    return parsed2.success ? parsed2.data : null;
  }

  // extensions/src/entry/actions.ts
  var OPERATION_START_ACTION = "operation.start";
  var OPERATION_CANCEL_ACTION = "operation.cancel";
  var OperationStartCredentialsSchema = external_exports.object({
    loginId: external_exports.string().min(1).max(200),
    password: external_exports.string().min(1).max(500),
    supplierLoginId: external_exports.string().min(1).max(200).nullable().optional()
  }).strict();
  var OperationStartMessageSchema = external_exports.object({
    action: external_exports.literal(OPERATION_START_ACTION),
    kind: OperationKindSchema,
    scope: external_exports.record(external_exports.string(), external_exports.unknown()).default({}),
    idempotencyKey: external_exports.string().min(1).max(128).optional(),
    credentials: OperationStartCredentialsSchema.optional()
  }).strict();
  var OperationCancelMessageSchema = external_exports.object({
    action: external_exports.literal(OPERATION_CANCEL_ACTION),
    operationId: external_exports.string().uuid()
  }).strict();

  // extensions/src/entry/operation-actions.ts
  var LOCAL_TEXT = {
    VALIDATION_FAILED: "\uC785\uB825\uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uD45C\uC2DC\uB41C \uD56D\uBAA9\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    OPERATION_IN_PROGRESS: "\uAC19\uC740 \uC2E4\uD589\uC774 \uC774\uBBF8 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4. \uB05D\uB098\uAC70\uB098 \uC911\uB2E8\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.",
    OPERATION_FENCE_LOST: "\uC774 \uC2E4\uD589\uC740 \uB354 \uC774\uC0C1 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uC791\uD574 \uC8FC\uC138\uC694."
  };
  function createOperationActions(deps) {
    const environments = /* @__PURE__ */ new Map();
    const running = /* @__PURE__ */ new Map();
    function forEnvironment(environmentId) {
      let entry = environments.get(environmentId);
      if (!entry) {
        const client = createOperationClient(deps.apiFor(environmentId));
        const runner = createRunner({ client, browser: deps.browser, siteFor: deps.siteFor ?? (() => null) }, collectorFor);
        entry = { client, runner };
        environments.set(environmentId, entry);
      }
      return entry;
    }
    return {
      [OPERATION_START_ACTION]: {
        validate: (message) => validateWith(OperationStartMessageSchema, message),
        async handle(input, environmentId) {
          if (!input.ok) return input.response;
          const { kind, scope, idempotencyKey, credentials } = input.message;
          const controller = new AbortController();
          const owned = [];
          let answer;
          const begun = new Promise((resolve) => {
            answer = resolve;
          });
          const run = forEnvironment(environmentId).runner.run({
            kind,
            scope,
            ...idempotencyKey !== void 0 ? { idempotencyKey } : {},
            ...credentials !== void 0 ? { credentials } : {},
            signal: controller.signal,
            onBegun({ operationId, reused }) {
              running.set(operationId, controller);
              owned.push(operationId);
              answer({ success: true, operationId, reused });
            }
          });
          const done = run.finally(() => {
            for (const id of owned) running.delete(id);
          });
          deps.keepAlive?.(done);
          return Promise.race([
            begun,
            done.then(
              (outcome) => (
                // 같은 idempotencyKey 재요청이고 이 확장이 그 실행을 돌리고 있으면 그대로 이어지는 중이다.
                outcome.kind === "already_running" && outcome.reused && outcome.existing && running.has(outcome.existing.operationId) ? { success: true, operationId: outcome.existing.operationId, reused: true } : earlyResponse(outcome)
              )
            )
          ]);
        }
      },
      [OPERATION_CANCEL_ACTION]: {
        validate: (message) => validateWith(OperationCancelMessageSchema, message),
        async handle(input, environmentId) {
          if (!input.ok) return input.response;
          const { operationId } = input.message;
          try {
            const operation = await forEnvironment(environmentId).client.cancel(operationId);
            return { success: true, operation };
          } catch (error) {
            return failure(error);
          } finally {
            running.get(operationId)?.abort();
          }
        }
      }
    };
  }
  function earlyResponse(outcome) {
    switch (outcome.kind) {
      case "already_running":
        return {
          success: false,
          errorCode: "OPERATION_IN_PROGRESS",
          error: outcome.message ?? LOCAL_TEXT.OPERATION_IN_PROGRESS,
          details: { existing: outcome.existing }
        };
      case "failed":
        return { success: false, errorCode: outcome.errorCode, error: outcome.errorMessage, ...outcome.details ? { details: outcome.details } : {} };
      case "fence_lost":
        return { success: false, errorCode: "OPERATION_FENCE_LOST", error: LOCAL_TEXT.OPERATION_FENCE_LOST };
      case "finished":
        return { success: true, operationId: outcome.operation.id, reused: false };
    }
  }
  function failure(error) {
    if (isRuntimeError(error)) return { success: false, errorCode: error.code, error: error.message, details: error.details };
    return { success: false, errorCode: "RUNTIME_API_UNREACHABLE", error: error instanceof Error ? error.message : String(error) };
  }
  function validateWith(schema, message) {
    const parsed2 = schema.safeParse(message);
    if (parsed2.success) return { ok: true, message: parsed2.data };
    return {
      ok: false,
      response: {
        success: false,
        errorCode: "VALIDATION_FAILED",
        error: LOCAL_TEXT.VALIDATION_FAILED,
        details: { errors: parsed2.error.issues.map((issue) => ({ field: issue.path.join("."), reason: issue.message })) }
      }
    };
  }

  // extensions/src/entry/sourcing-product-collect.ts
  var COLLECT_CURRENT = "COLLECT_CURRENT";
  var HOST_KEEPALIVE_PORT = "kiditem-1688-trend-keepalive";
  function productExtensionScope(url) {
    if (!url) return null;
    try {
      const parsed2 = new URL(url);
      if (parsed2.protocol !== "https:") return null;
      const host = parsed2.hostname.toLowerCase();
      if (host === "1688.com" || host.endsWith(".1688.com")) return { platform: "1688", url: parsed2.toString() };
      if (host === "alibaba.com" || host.endsWith(".alibaba.com")) return { platform: "alibaba", url: parsed2.toString() };
      return null;
    } catch {
      return null;
    }
  }
  async function collectCurrentProduct(deps, input) {
    const tab = await deps.getTab(input.tabId).catch(() => null);
    const scope = productExtensionScope(tab?.url);
    if (!scope) return { ok: false, error: "1688 \uB610\uB294 Alibaba \uC0C1\uD488 \uD398\uC774\uC9C0\uC5D0\uC11C \uC218\uC9D1\uD574 \uC8FC\uC138\uC694." };
    const runner = createRunner({
      client: createOperationClient(deps.apiFor(input.environmentId)),
      browser: deps.browser,
      // 운영자 탭을 임대로 묶는다 — 상품 페이지 사이트는 이 탭에서만 읽는다.
      siteFor: (kind) => createSiteHandles(deps.site)(kind, { tabId: input.tabId })
    }, collectorFor);
    const work = runner.run({ kind: SOURCING_OPERATION_KINDS.productExtension, scope, signal: new AbortController().signal });
    deps.keepAlive?.(work);
    const outcome = await work;
    if (outcome.kind === "finished" && outcome.operation.status === "succeeded") return { ok: true, operationId: outcome.operation.id };
    if (outcome.kind === "failed") return { ok: false, errorCode: outcome.errorCode, error: outcome.errorMessage };
    if (outcome.kind === "already_running") return { ok: false, errorCode: "OPERATION_IN_PROGRESS", error: outcome.message ?? "\uC774 \uC0C1\uD488 \uC218\uC9D1\uC774 \uC774\uBBF8 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4." };
    if (outcome.kind === "fence_lost") return { ok: false, errorCode: "OPERATION_FENCE_LOST", error: "\uC218\uC9D1\uC774 \uB354 \uC774\uC0C1 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694." };
    return { ok: false, error: outcome.operation.errorMessage ?? "\uC0C1\uD488 \uC218\uC9D1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." };
  }
  function installProductCollect(chromeApi, deps) {
    chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const record2 = message && typeof message === "object" ? message : null;
      if (record2?.type !== COLLECT_CURRENT) return;
      const tabId = record2.tabId;
      const environmentId = record2.environmentId;
      if (typeof tabId !== "number" || typeof environmentId !== "string" || !environmentId) {
        sendResponse({ ok: false, error: "\uC218\uC9D1\uD560 \uD0ED\uACFC KidItem \uD658\uACBD\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694." });
        return;
      }
      collectCurrentProduct(deps, { tabId, environmentId }).then(sendResponse, (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    });
    chromeApi.runtime.onConnect.addListener((port) => {
      if (port.name !== HOST_KEEPALIVE_PORT) return;
      port.onMessage.addListener(() => void 0);
    });
  }

  // extensions/src/entry/index.ts
  function installEntry() {
    if (!legacyGlobalsPresent()) return false;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const site = {
      fetch: (input, init) => fetch(input, init),
      cookies: { get: (details) => chrome.cookies.get(details) },
      now: () => Date.now(),
      sleep,
      tabs: createTabPages({ chrome, fetch: (input, init) => fetch(input, init), sleep, now: () => Date.now() }),
      randomId: () => crypto.randomUUID()
    };
    const browser = createBrowserResources(chrome, entrySites(), { accountSite: ACCOUNT_SITE, ownTabSites: ownTabSites() });
    const channelSites = createSiteHandles(site);
    const externalActions = createOperationActions({
      apiFor: legacyApiPort,
      // `account:<id>` 잠금은 그 계정의 Wing 탭을 쓴다(KID-354). 로그인 확인은 사이트 호출기의 SITE_LOGIN_REQUIRED.
      // DOM을 읽는 소싱 사이트는 탭을 스스로 열고 닫는다(KID-360).
      browser,
      siteFor: channelSites,
      keepAlive: legacyKeepAlive
    });
    registerWithLegacyDomains({
      externalActions,
      capabilities: {
        operationRuntime: true,
        sourcingOperationKindsV1: true,
        orderCaptureOperationKindsV1: true,
        [CHANNELS_OPERATION_CAPABILITY]: true,
        operationLoginV1: true,
        advertisingKeywordOperationKindsV1: true,
        wingDailyOperationKindsV1: true,
        [SELLPIA_OPERATION_CAPABILITY]: true
      }
    });
    installProductCollect(chrome, { apiFor: legacyApiPort, browser, site, getTab: (tabId) => chrome.tabs.get(tabId), keepAlive: legacyKeepAlive });
    return true;
  }

  // extensions/src/index.ts
  function version() {
    return chrome.runtime.getManifest().version;
  }
  var runtime = { kinds: registeredKinds };
  installEntry();
  return __toCommonJS(index_exports);
})();
