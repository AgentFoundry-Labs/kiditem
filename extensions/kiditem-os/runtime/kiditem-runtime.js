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
    for (const [optionId, count] of mediaCountByOption.entries()) {
      if (count > COUPANG_CATALOG_MAX_MEDIA_PER_OWNER) {
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
    const parsed = ErrorEnvelopeSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  }
  function isRuntimeError(value) {
    return value instanceof RuntimeError;
  }

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
      const progress = () => ({
        detailsDone,
        detailTargets: targets.length,
        absentChecked,
        absentTotal: absent.length,
        detailsMissing: [...missing]
      });
      const details = new ChunkBuffer({ maxItems: DETAILS_PER_CHUNK, label: "Wing \uC0C1\uC138 \uC0C1\uD488" });
      const chunk = (chunkKind, payload) => ({ chunkKind, payload, progress: progress() });
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
      const progress = (value) => ({ chunkKind: PROGRESS_CHUNK_KIND, payload: [], progress: value });
      yield progress({ status: "REQUESTED", executeCount: 0, totalCount: null });
      let completed = null;
      for (let poll = 0; poll < MAX_POLLS && !completed; poll += 1) {
        if (signal.aborted) return;
        if (poll > 0) await site.pause(POLL_INTERVAL_MS, signal);
        const request = await site.catalogExcelRequest(description);
        if (!request) continue;
        yield progress({ status: request.status, executeCount: request.executeCount, totalCount: request.totalCount });
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
      let progress = {};
      const chunk = (payload) => ({ chunkKind: WING_CATALOG_CHUNK_KINDS.listingBasics, payload, progress });
      for (let page = 1; expected === null || page <= expected.totalPages; page += 1) {
        if (signal.aborted) return;
        const result = await site.searchInventory(page, plan.vendorId ?? null);
        if (expected === null) expected = { totalItems: result.totalItems, totalPages: result.totalPages };
        else if (result.totalItems !== expected.totalItems || result.totalPages !== expected.totalPages) {
          throw incomplete(`\uC218\uC9D1 \uC911 Wing \uC0C1\uD488 \uC218\uAC00 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4(${expected.totalItems} \u2192 ${result.totalItems}). \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD574 \uC8FC\uC138\uC694.`);
        }
        progress = { listedProducts: seen.size + result.products.length, totalProducts: expected.totalItems, page, totalPages: expected.totalPages };
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

  // extensions/src/core/browser.ts
  var RUNTIME_BROWSER_ALREADY_ACQUIRED = "RUNTIME_BROWSER_ALREADY_ACQUIRED";
  var RUNTIME_BROWSER_UNAVAILABLE = "RUNTIME_BROWSER_UNAVAILABLE";
  function createBrowserResources(chromeApi, sites, options = {}) {
    const held = /* @__PURE__ */ new Set();
    return {
      async acquire({ operationId, lockKeys, signal }) {
        if (held.has(operationId)) {
          throw new RuntimeError(RUNTIME_BROWSER_ALREADY_ACQUIRED, "\uC774 \uC2E4\uD589\uC740 \uC774\uBBF8 \uBE0C\uB77C\uC6B0\uC800 \uC790\uC6D0\uC744 \uC7A1\uACE0 \uC788\uC2B5\uB2C8\uB2E4.", { operationId });
        }
        signal.throwIfAborted();
        const siteNames = [...new Set(lockKeys.map((key) => siteOfLockKey(key, options)).filter((name) => name !== null && name in sites))];
        if (siteNames.length > 1) {
          throw new RuntimeError(RUNTIME_BROWSER_UNAVAILABLE, "\uD55C \uC2E4\uD589\uC774 \uB450 \uC0AC\uC774\uD2B8\uC758 \uD0ED\uC744 \uD568\uAED8 \uC7A1\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { sites: siteNames });
        }
        held.add(operationId);
        try {
          const tab = siteNames.length === 1 ? await openSiteTab(chromeApi, sites[siteNames[0]].origin) : null;
          let released = false;
          return {
            tabId: tab?.tabId ?? null,
            async release() {
              if (released) return;
              released = true;
              held.delete(operationId);
              if (tab?.opened) await chromeApi.tabs.remove(tab.tabId).catch(() => void 0);
            }
          };
        } catch (error) {
          held.delete(operationId);
          throw error;
        }
      }
    };
  }
  function siteOfLockKey(key, options) {
    if (key.startsWith("resource:")) return key.split(":")[1] ?? null;
    if (key.startsWith("account:")) return options.accountSite ?? null;
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
    if (!isRecord(payload)) throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D API \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
    if (Object.hasOwn(payload, "success") && (payload.success !== true || payload.message !== null)) {
      throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D API \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
    }
    const data = payload.data;
    const pagination = isRecord(data) ? data.pagination : void 0;
    const productList = isRecord(data) ? data.productList : void 0;
    if (!isRecord(data) || !Array.isArray(productList) || !isRecord(pagination)) {
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
      if (!isRecord(row)) throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D \uD589\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
      if (!Number.isSafeInteger(row.vendorInventoryId) || row.vendorInventoryId <= 0) {
        throw new WingPayloadError("Wing \uC0C1\uD488 ID\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
      }
      const externalProductId = String(row.vendorInventoryId);
      if (seen.has(externalProductId)) throw new WingPayloadError(`Wing \uC0C1\uD488 ID\uAC00 \uC911\uBCF5\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${externalProductId}`);
      seen.add(externalProductId);
      if (row.vendorId !== void 0 && (typeof row.vendorId !== "string" || expectedVendorId && row.vendorId !== expectedVendorId)) {
        throw new WingPayloadError(`Wing \uD310\uB9E4\uC790 ID\uAC00 \uC218\uC9D1 \uACC4\uC815\uACFC \uB2E4\uB985\uB2C8\uB2E4: ${externalProductId}`);
      }
      requiredText(row.productName, "Wing \uC0C1\uD488\uBA85");
      return buildCatalogBasicProduct(row);
    });
    return { page: requestedPage, pageSize, totalItems, totalPages, products };
  }
  function buildCatalogBasicProduct(inventoryProduct) {
    if (!isRecord(inventoryProduct)) throw new WingPayloadError("Wing \uC0C1\uD488 \uBAA9\uB85D \uD589\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
    const externalProductId = strictRequiredId(inventoryProduct.vendorInventoryId, "vendorInventoryId");
    const items = Array.isArray(inventoryProduct.vendorInventoryItems) ? inventoryProduct.vendorInventoryItems : [];
    if (items.length === 0) throw new WingPayloadError(`Wing \uC0C1\uD488 ${externalProductId}\uC5D0 vendorInventoryItems\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4`);
    const saleStatus = saleStatusFromWingProductStatus(requiredText(inventoryProduct.productStatus, "Wing \uD310\uB9E4 \uC0C1\uD0DC"));
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
    if (!isRecord(item)) throw new WingPayloadError("Wing vendorInventoryItem \uD589\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
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
    if (!isRecord(sellerProduct)) throw new WingPayloadError("Wing \uC0C1\uD488 \uC0C1\uC138 JSON\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
    const externalProductId = strictRequiredId(sellerProduct.sellerProductId, "sellerProductId");
    const items = Array.isArray(sellerProduct.items) ? sellerProduct.items : [];
    if (items.length === 0) throw new WingPayloadError(`Wing \uC0C1\uD488 ${externalProductId}\uC5D0 \uC635\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4`);
    const documents = [];
    const documentByKey = /* @__PURE__ */ new Map();
    const mediaByKey = /* @__PURE__ */ new Map();
    const options = [];
    const optionIds = /* @__PURE__ */ new Set();
    for (const rawItem of items) {
      const item = isRecord(rawItem) ? rawItem : {};
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
        const record = isRecord(image) ? image : {};
        addDetailMedia(mediaByKey, "option", normalizeImageUrl(record.cdnPath || record.vendorPath), externalOptionId);
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
        const count = (mediaCountByOption.get(owner) ?? 0) + 1;
        if (count > MAX_MEDIA_PER_OWNER) {
          throw new WingPayloadError(`Wing \uC0C1\uC138 \uC0C1\uD488 ${externalProductId} \uC635\uC158 ${owner}\uC758 \uBBF8\uB514\uC5B4\uAC00 \uD5C8\uC6A9 \uAC1C\uC218\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4`);
        }
        mediaCountByOption.set(owner, count);
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
      const details = isRecord(content) && Array.isArray(content.contentDetails) ? content.contentDetails : [];
      for (const detail of details) {
        const html = String(isRecord(detail) ? detail.content ?? "" : "");
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
      const record = isRecord(attribute) ? attribute : {};
      return {
        type: nullableText(record.attributeTypeName || record.attributeTypeId),
        value: nullableText(record.attributeValueName)
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
    const text = `${field}\0${stableStringify(value)}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
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
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return null;
    if (text.startsWith("//")) return `https:${text}`;
    if (/^https?:\/\//i.test(text)) return text;
    return `https://image1.coupangcdn.com/image/${text.replace(/^\/+/, "")}`;
  }
  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function nullableText(value) {
    if (value === null || value === void 0) return null;
    const text = String(value).trim();
    return text || null;
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
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
  }
  function requiredText(value, name) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new WingPayloadError(`${name} \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4`);
    return text;
  }
  function requiredPositiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new WingPayloadError(`${name} \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    return value;
  }
  function requiredNonNegativeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) throw new WingPayloadError(`${name} \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    return value;
  }

  // extensions/src/sites/wing/index.ts
  var ORIGIN = "https://wing.coupang.com";
  var SEARCH_URL = `${ORIGIN}/tenants/seller-web/v2/vendor-inventory/search`;
  var DETAIL_URL = `${ORIGIN}/tenants/seller-web/v2/vendor-inventory/seller-product/`;
  var EXCEL_BASE = `${ORIGIN}/tenants/seller-web/excel/request/download`;
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
    origin: ORIGIN,
    caller: {
      minIntervalMs: 2e3,
      timeoutMs: WING_TIMEOUT_MS,
      displayName: "\uCFE0\uD321 \uC719",
      xsrf: { cookieUrl: ORIGIN, cookieName: "XSRF-TOKEN", headerName: "X-XSRF-TOKEN" }
    }
  };
  function createWingSite(caller, deps) {
    async function readJson(url, init, notFoundIsAnswer = false) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await caller.json(url, init);
        } catch (error) {
          const failed = isRuntimeError(error) && error.code === SITE_REQUEST_FAILED;
          if (failed && notFoundIsAnswer && error.details?.status === 404) return NOT_FOUND;
          const delay = READ_RETRY_DELAYS_MS[attempt];
          if (!failed) throw error;
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
      async searchInventory(page, vendorId) {
        const response = await searchJson(buildWingCatalogSearchBody(page));
        try {
          return normalizeWingCatalogSearchResponse(response, page, vendorId);
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
        const record = asRecord(response);
        if (record?.success !== true) {
          const message = typeof record?.message === "string" && record.message ? `: ${record.message}` : "";
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

  // extensions/src/entry/site-handles.ts
  var ENTRY_SITES = { [WING_SITE.name]: { origin: WING_SITE.origin } };
  var ACCOUNT_SITE = WING_SITE.name;
  function createSiteHandles(deps) {
    return (kind) => {
      const site = collectorFor(kind)?.site ?? null;
      if (site === WING_SITE.name) return createWingSite(createSiteCaller(WING_SITE.caller, deps), { sleep: deps.sleep });
      return null;
    };
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
      async putChunk({ operationId, token, chunkKind, sequence, payload, progress }) {
        const checksum = await sha256Hex(JSON.stringify(payload));
        return call(
          api,
          `${base}/${encodeURIComponent(operationId)}/chunks/${encodeURIComponent(chunkKind)}/${sequence}`,
          { method: "PUT", token, body: { checksum, payload, ...progress ? { progress } : {} } },
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new RuntimeError(RUNTIME_API_UNREACHABLE, "KidItem \uC11C\uBC84 \uC751\uB2F5\uC774 \uC2E4\uD589 \uACC4\uC57D\uACFC \uB2E4\uB985\uB2C8\uB2E4.", { path, status: response.status });
    }
    return parsed.data;
  }
  async function sha256Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
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
          const { idempotencyKey: _previousKey, ...rest } = step;
          step = { ...rest, kind: next.kind, scope: next.scope };
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
    try {
      lease = await deps.browser.acquire({ operationId, lockKeys: operation.lockKeys, signal: local.signal });
      const site = deps.siteFor(operation.kind, lease);
      const sequences = /* @__PURE__ */ new Map();
      let chunks = 0;
      let items = 0;
      scheduleHeartbeat();
      for await (const chunk of collector.collect(operation.plan ?? {}, site, { signal: local.signal, tabId: lease.tabId })) {
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
      const stop = stopFor(error.code, error.details);
      if (stop.kind === "fence_lost") return { kind: "fence_lost", operationId, reason: stop.reason };
      await writes;
      await deps.client.finish({ operationId, token, request: { outcome: "failed", errorCode: error.code.slice(0, 64), errorMessage: error.message.slice(0, 2e3) } }).catch(() => void 0);
      return { kind: "failed", operationId, errorCode: error.code, errorMessage: error.message, ...error.details ? { details: error.details } : {} };
    } finally {
      stopHeartbeat();
      local.abort();
      input.signal.removeEventListener("abort", onAbort);
      await lease?.release().catch(() => void 0);
    }
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
    const parsed = OperationNextSchema.safeParse(next);
    return parsed.success ? parsed.data : null;
  }

  // extensions/src/entry/actions.ts
  var OPERATION_START_ACTION = "operation.start";
  var OPERATION_CANCEL_ACTION = "operation.cancel";
  var OperationStartMessageSchema = external_exports.object({
    action: external_exports.literal(OPERATION_START_ACTION),
    kind: OperationKindSchema,
    scope: external_exports.record(external_exports.string(), external_exports.unknown()).default({}),
    idempotencyKey: external_exports.string().min(1).max(128).optional()
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
          const { kind, scope, idempotencyKey } = input.message;
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
    const parsed = schema.safeParse(message);
    if (parsed.success) return { ok: true, message: parsed.data };
    return {
      ok: false,
      response: {
        success: false,
        errorCode: "VALIDATION_FAILED",
        error: LOCAL_TEXT.VALIDATION_FAILED,
        details: { errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), reason: issue.message })) }
      }
    };
  }

  // extensions/src/entry/index.ts
  function installEntry() {
    if (!legacyGlobalsPresent()) return false;
    const externalActions = createOperationActions({
      apiFor: legacyApiPort,
      // `account:<id>` 잠금은 그 계정의 Wing 탭을 쓴다(KID-354). 로그인 확인은 사이트 호출기의 SITE_LOGIN_REQUIRED.
      browser: createBrowserResources(chrome, ENTRY_SITES, { accountSite: ACCOUNT_SITE }),
      siteFor: createSiteHandles({
        fetch: (input, init) => fetch(input, init),
        cookies: { get: (details) => chrome.cookies.get(details) },
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      }),
      keepAlive: legacyKeepAlive
    });
    registerWithLegacyDomains({ externalActions, capabilities: { operationRuntime: true } });
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
