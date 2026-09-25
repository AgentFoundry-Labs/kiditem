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
      const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
      const decoded = JSON.parse(atob(base64));
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
    value.keywords.forEach((keyword, index) => {
      const identity = sourcingWingCatalogKeywordIdentity(keyword);
      if (identities.has(identity)) {
        context.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["keywords", index],
          message: "Wing catalog keywords must be unique after normalization."
        });
      }
      identities.add(identity);
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
  var CoupangSellerIdSchema = external_exports.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/u);
  var AdvertisingCompetitorCatalogProductSchema = external_exports.object({
    sourceRank: external_exports.number().int().min(1).max(500),
    productId: external_exports.string().trim().min(1).max(200).nullable(),
    itemId: external_exports.string().trim().min(1).max(200).nullable(),
    vendorItemId: external_exports.string().trim().min(1).max(200).nullable(),
    name: external_exports.string().trim().min(1).max(500),
    priceKrw: BoundedCountSchema2.nullable(),
    reviewCount: BoundedCountSchema2.nullable(),
    imageUrl: external_exports.string().trim().max(2e3).nullable(),
    link: external_exports.string().trim().max(2e3).nullable()
  }).strict().superRefine((value, context) => {
    if (!value.productId && !value.itemId && !value.vendorItemId) {
      context.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["productId"],
        message: "A competitor catalog product requires an exact identity."
      });
    }
  });
  var CoupangSellerStoreUrlSchema = external_exports.string().trim().url().max(2e3).refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && parsed.hostname === "shop.coupang.com";
    } catch {
      return false;
    }
  }, "Only Coupang seller-store URLs are accepted as catalog evidence.");
  var AdvertisingCompetitorCatalogItemSchema = external_exports.object({
    keyword: SourcingWingCatalogKeywordSchema,
    sellerId: CoupangSellerIdSchema,
    sellerName: external_exports.string().trim().min(1).max(300),
    sellerStoreUrl: CoupangSellerStoreUrlSchema,
    totalProductCount: BoundedCountSchema2.nullable(),
    collectedProductCount: external_exports.number().int().min(1).max(500),
    isTruncated: external_exports.boolean(),
    sort: external_exports.literal("newest"),
    capturedAt: InstantSchema,
    products: external_exports.array(AdvertisingCompetitorCatalogProductSchema).min(1).max(500)
  }).strict().superRefine((value, context) => {
    if (value.collectedProductCount !== value.products.length) {
      context.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["collectedProductCount"],
        message: "Collected product count must match the bounded rows."
      });
    }
  });
  var AdvertisingCompetitorCatalogBatchSchema = external_exports.object({
    catalogs: external_exports.array(AdvertisingCompetitorCatalogItemSchema).min(1).max(20)
  }).strict().superRefine((value, context) => {
    const sellers = /* @__PURE__ */ new Set();
    value.catalogs.forEach((catalog, index) => {
      if (sellers.has(catalog.sellerId)) {
        context.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["catalogs", index, "sellerId"],
          message: "Competitor seller IDs must be unique per owner batch."
        });
      }
      sellers.add(catalog.sellerId);
    });
  });
  var AdvertisingTrackedWingProductsInputSchema = external_exports.object({
    keywords: external_exports.array(SourcingWingCatalogKeywordSchema).min(1).max(12),
    maxPages: external_exports.number().int().min(1).max(5),
    purpose: external_exports.literal("tracked_metrics"),
    trackedProductIds: external_exports.array(external_exports.string().trim().min(1).max(200)).min(1).max(200)
  }).strict().superRefine((value, context) => {
    const keywordIdentities = /* @__PURE__ */ new Set();
    value.keywords.forEach((keyword, index) => {
      const identity = sourcingWingCatalogKeywordIdentity(keyword);
      if (keywordIdentities.has(identity)) {
        context.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["keywords", index],
          message: "Wing catalog keywords must be unique after normalization."
        });
      }
      keywordIdentities.add(identity);
    });
    const productIds = /* @__PURE__ */ new Set();
    value.trackedProductIds.forEach((productId, index) => {
      if (productIds.has(productId)) {
        context.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["trackedProductIds", index],
          message: "Tracked product IDs must be unique."
        });
      }
      productIds.add(productId);
    });
  });
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
    async *collect(plan, site, { signal }) {
      if (signal.aborted) return;
      const captured = await site.broadcast(plan.pageUrl);
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
    async *collect(plan, site, { signal }) {
      const visits = [];
      const seen = /* @__PURE__ */ new Set();
      let region = plan.regionOverride;
      let total = 0;
      try {
        for (const targetId of plan.targetIds) {
          if (signal.aborted) return;
          const captured = await site.target(site.targetFor(targetId), region);
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
    async *collect(plan, site, { signal }) {
      try {
        for (const [index, keyword] of plan.keywords.entries()) {
          if (signal.aborted) return;
          const items = await site.offers(keyword);
          yield {
            chunkKind: SOURCING_CHUNK_KINDS.offers1688,
            payload: [{ keyword, items }],
            progress: { current: index + 1, total: plan.keywords.length, label: keyword }
          };
        }
      } finally {
        await site.close();
      }
    }
  };
  registerCollector(sourcingTrend1688Collector);

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

  // extensions/src/collectors/sourcing.wing_catalog/index.ts
  var MAX_ITEMS_PER_KEYWORD = 100;
  var SOURCING_COLLECTION_INCOMPLETE = "SOURCING_COLLECTION_INCOMPLETE";
  var sourcingWingCatalogCollector = {
    kind: SOURCING_OPERATION_KINDS.wingCatalog,
    site: "wing",
    async *collect(plan, site, { signal }) {
      for (const [index, keyword] of plan.keywords.entries()) {
        if (signal.aborted) return;
        const rows = /* @__PURE__ */ new Map();
        let searchPage = 0;
        for (let pageIndex = 0; pageIndex < plan.maxPages; pageIndex += 1) {
          if (signal.aborted) return;
          const page = await site.searchPage(keyword, searchPage);
          for (const row of page.rows) {
            const key = site.identity(row);
            if (!rows.has(key)) rows.set(key, row);
          }
          if (page.rows.length === 0 || page.nextSearchPage === null) break;
          if (page.nextSearchPage === searchPage) {
            if (pageIndex + 1 < plan.maxPages) {
              throw new RuntimeError(SOURCING_COLLECTION_INCOMPLETE, `Wing \uAC80\uC0C9 '${keyword}'\uC758 \uB2E4\uC74C \uCABD\uC774 \uB118\uC5B4\uAC00\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.`, { keyword });
            }
            break;
          }
          searchPage = page.nextSearchPage;
        }
        const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
        const items = [...rows.values()].map((row) => site.toObservation(row, keyword, capturedAt)).filter((item) => item !== null).slice(0, MAX_ITEMS_PER_KEYWORD);
        yield {
          chunkKind: SOURCING_CHUNK_KINDS.wingSearchPage,
          payload: [{ keyword, maxPages: plan.maxPages, purpose: plan.purpose, items }],
          progress: { current: index + 1, total: plan.keywords.length, label: keyword }
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

  // extensions/src/sites/tab-page.ts
  var SITE_TAB_UNAVAILABLE = "SITE_TAB_UNAVAILABLE";
  var POLL_MS = 250;
  var MISSING_RECEIVER = /(?:receiving end|could not establish|message port|no listener)/i;
  function createTabPages(deps) {
    function page(tabId, owned) {
      let closed = false;
      async function send(message, timeoutMs) {
        let timer;
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), timeoutMs);
        });
        const answer = deps.chrome.tabs.sendMessage(tabId, message).then(
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
        async navigate(url, { timeoutMs, stopAt }) {
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
              throw new RuntimeError(SITE_TAB_UNAVAILABLE, "\uD398\uC774\uC9C0\uB97C \uC5EC\uB294 \uB370 \uC2DC\uAC04\uC774 \uB108\uBB34 \uC624\uB798 \uAC78\uB9BD\uB2C8\uB2E4.", { url });
            }
            await deps.sleep(POLL_MS);
          }
        },
        async currentUrl() {
          const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
          if (!tab?.url) throw new RuntimeError(SITE_TAB_UNAVAILABLE, "\uC218\uC9D1\uD560 \uD0ED\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { tabId });
          return tab.url;
        },
        async ask(message, { timeoutMs, inject }) {
          const first = await send(message, timeoutMs);
          if (!inject || !isMissing(first)) return first;
          await deps.chrome.scripting.executeScript({ target: { tabId }, files: [...inject.isolated] });
          if (inject.main?.length) {
            await deps.sleep(300);
            await deps.chrome.scripting.executeScript({ target: { tabId }, files: [...inject.main], world: "MAIN" });
          }
          await deps.sleep(500);
          return send(message, timeoutMs);
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

  // extensions/src/core/site-caller.ts
  function delayUntilNext(input) {
    if (input.lastSentAt === null) return 0;
    return Math.max(0, input.lastSentAt + input.minIntervalMs - input.now);
  }
  var SITE_REQUEST_FAILED = "SITE_REQUEST_FAILED";
  var SITE_LOGIN_REQUIRED = "SITE_LOGIN_REQUIRED";
  function createSiteCaller(options, deps) {
    let lastSentAt = null;
    let queue = Promise.resolve();
    const loginMessage = options.displayName ? `${options.displayName} \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.` : "\uC0AC\uC774\uD2B8 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
    async function send(url, init = {}) {
      const headers = new Headers(init.headers);
      if (options.xsrf) {
        const cookie = await deps.cookies.get({ url: options.xsrf.cookieUrl, name: options.xsrf.cookieName });
        const token = decodeCookie(cookie?.value);
        if (!token) {
          throw new RuntimeError(SITE_LOGIN_REQUIRED, loginMessage, { url, reason: "xsrf_cookie_missing" });
        }
        headers.set(options.xsrf.headerName, token);
      }
      const wait = delayUntilNext({ lastSentAt, now: deps.now(), minIntervalMs: options.minIntervalMs });
      if (wait > 0) await deps.sleep(wait);
      lastSentAt = deps.now();
      let response;
      try {
        response = await deps.fetch(url, { credentials: "include", redirect: "manual", ...init, headers });
      } catch (error) {
        throw new RuntimeError(SITE_REQUEST_FAILED, "\uC0AC\uC774\uD2B8\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { status: null, url }, error);
      }
      if (response.status === 401 || response.status === 403 || response.type === "opaqueredirect") {
        throw new RuntimeError(SITE_LOGIN_REQUIRED, loginMessage, { status: response.status, url });
      }
      if (!response.ok) {
        throw new RuntimeError(SITE_REQUEST_FAILED, `\uC0AC\uC774\uD2B8 \uC694\uCCAD\uC774 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4(${response.status}).`, { status: response.status, url });
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
        try {
          return await response.json();
        } catch (error) {
          throw new RuntimeError(SITE_REQUEST_FAILED, "\uC0AC\uC774\uD2B8 \uC751\uB2F5\uC774 JSON\uC774 \uC544\uB2D9\uB2C8\uB2E4.", { status: response.status, url }, error);
        }
      }),
      text: (url, init) => enqueue(async () => (await send(url, init)).text()),
      bytes: (url, init) => enqueue(async () => new Uint8Array(await (await send(url, init)).arrayBuffer()))
    };
  }
  function decodeCookie(value) {
    if (!value) return null;
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }

  // extensions/src/sites/wing/pre-matching-search.ts
  var ORIGIN = "https://wing.coupang.com";
  var SEARCH_URL = `${ORIGIN}/tenants/seller-web/pre-matching/search`;
  var RETRY_ATTEMPTS = 4;
  var WING_SEARCH_PAYLOAD_INVALID = "WING_SEARCH_PAYLOAD_INVALID";
  var WING_SEARCH_SITE = {
    name: "wing",
    origin: ORIGIN,
    caller: {
      minIntervalMs: 2200,
      displayName: "\uCFE0\uD321 \uC719",
      xsrf: { cookieUrl: ORIGIN, cookieName: "XSRF-TOKEN", headerName: "X-XSRF-TOKEN" }
    }
  };
  function createWingPreMatchingSearch(caller, deps) {
    return {
      /** 키워드 한 페이지. 429·5xx·연결 끊김은 네 번까지 다시 묻는다. */
      async searchPage(keyword, searchPage) {
        const body = JSON.stringify({ keyword, excludedProductIds: [], searchPage, searchOrder: "DEFAULT", sortType: "DEFAULT" });
        for (let attempt = 1; ; attempt += 1) {
          let response;
          try {
            response = await caller.json(SEARCH_URL, {
              method: "POST",
              headers: { "content-type": "application/json", accept: "application/json, text/plain, */*" },
              body
            });
          } catch (error) {
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
      toObservation: (row, keyword, capturedAt) => row.productName.trim() ? toSourcingWingCatalogObservation(row, keyword, capturedAt) : null
    };
  }
  function parseWingSearchPage(body) {
    const record = asRecord(body);
    if (!record || !Array.isArray(record.result)) {
      throw new RuntimeError(WING_SEARCH_PAYLOAD_INVALID, "Wing \uAC80\uC0C9 \uC751\uB2F5\uC758 \uBAA8\uC591\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
    const next = record.nextSearchPage;
    return {
      rows: record.result.map(normalizeWingSearchProduct).filter((row) => row !== null),
      nextSearchPage: typeof next === "number" && Number.isInteger(next) ? next : null
    };
  }
  function normalizeWingSearchProduct(raw) {
    const product = asRecord(raw);
    if (!product || product.productId == null) return null;
    const productId = String(product.productId);
    if (!productId) return null;
    const salePrice = nullableNumber(product.salePrice);
    const salesLast28d = nullableNumber(product.salesLast28d);
    const pvLast28Day = nullableNumber(product.pvLast28Day);
    const category = Array.isArray(product.displayCategoryInfo) ? asRecord(product.displayCategoryInfo[0])?.categoryHierarchy : null;
    return {
      productId,
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
      salePriceKrw: boundedInteger(row.salePrice),
      ratingAverage: boundedNumber(row.rating, 0, 5),
      ratingCount: boundedInteger(row.ratingCount),
      viewsLast28d: boundedInteger(row.pvLast28Day),
      salesLast28d: boundedInteger(row.salesLast28d),
      estimatedRevenue28d: boundedNumber(row.estimatedRevenue28d, 0, 2147483647),
      conversionRate28d: boundedNumber(row.conversionRate28d, 0, 1),
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
  function boundedInteger(value) {
    return value !== null && Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
  }
  function boundedNumber(value, minimum, maximum) {
    return value !== null && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
  }
  function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
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
  var encoder = new TextEncoder();
  function createRunner(deps, collectorFor2) {
    return {
      async run(input) {
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
    };
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
    const bytes = encoder.encode(JSON.stringify(chunk.payload)).byteLength;
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
          let owned = null;
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
              owned = operationId;
              answer({ success: true, operationId, reused });
            }
          });
          const done = run.finally(() => {
            if (owned !== null) running.delete(owned);
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

  // extensions/src/sites/1688/index.ts
  var SEARCH_ORIGIN = "https://s.1688.com";
  var NAVIGATION_TIMEOUT_MS = 3e4;
  var EXTRACTION_TIMEOUT_MS = 2e4;
  var MAX_RESULTS_PER_KEYWORD = 20;
  var ALIBABA_CONTENT_FILES = {
    isolated: [
      "content/sourcing/extractors/common.js",
      "content/sourcing/extractors/alibaba.js",
      "content/sourcing/extractors/1688.js",
      "content/sourcing/content.js"
    ]
  };
  var SITE_VERIFICATION_REQUIRED = "SITE_VERIFICATION_REQUIRED";
  function build1688SearchUrl(keyword) {
    return `${SEARCH_ORIGIN}/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}&charset=utf8`;
  }
  function is1688VerificationUrl(value) {
    try {
      const url = new URL(value);
      return url.pathname.includes("/punish") || url.searchParams.get("action") === "captcha";
    } catch {
      return false;
    }
  }
  function create1688SearchSite(tabs) {
    let page = null;
    let keepOpen = false;
    return {
      async offers(keyword) {
        page ??= await tabs.open("about:blank");
        const landed = await page.navigate(build1688SearchUrl(keyword), { timeoutMs: NAVIGATION_TIMEOUT_MS, stopAt: is1688VerificationUrl });
        if (is1688VerificationUrl(landed)) throw verification(landed, keyword, () => {
          keepOpen = true;
        });
        const extracted = await page.ask(
          { type: "TRIGGER_1688_TREND_EXTRACT", maxResults: MAX_RESULTS_PER_KEYWORD },
          { timeoutMs: EXTRACTION_TIMEOUT_MS, inject: ALIBABA_CONTENT_FILES }
        );
        if (extracted.status === "verification_required") {
          throw verification(extracted.verificationUrl ?? landed, keyword, () => {
            keepOpen = true;
          });
        }
        if (!extracted.ok) {
          throw new RuntimeError(SITE_REQUEST_FAILED, `1688 \uAC80\uC0C9 '${keyword}' \uACB0\uACFC\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${extracted.error ?? "\uC54C \uC218 \uC5C6\uC74C"}`, { status: null, keyword });
        }
        return (Array.isArray(extracted.items) ? extracted.items : []).filter((item) => typeof item?.offerId === "string" && item.offerId.length > 0).slice(0, MAX_RESULTS_PER_KEYWORD);
      },
      /** 수집이 끝나면 탭을 닫는다. 검증 화면에서 멈췄으면 운영자가 풀 수 있게 남긴다. */
      async close() {
        if (page && !keepOpen) await page.close();
        page = null;
      }
    };
  }
  function verification(url, keyword, keep) {
    keep();
    return new RuntimeError(SITE_VERIFICATION_REQUIRED, "1688\uC774 \uC2AC\uB77C\uC774\uB354 \uAC80\uC99D\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 1688 \uD0ED\uC5D0\uC11C \uAC80\uC99D\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url, keyword });
  }

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
      const keyword = value.replace(/\s+/g, " ").trim();
      if (usableKeyword(keyword, seed)) candidates.push({ keyword, source });
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
    const text = autocomplete?.text.trim() ?? "";
    if (text && (autocomplete?.contentType.includes("application/json") || /^[[{]/.test(text))) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          if (isErrorEnvelope(parsed)) {
            const message = errorEnvelopeMessage(parsed);
            providerError ??= { reason: "provider_denied", message };
          } else {
            walk(parsed);
            structuredResponse = hasSuggestionCollection(parsed);
          }
        } else {
          warnings.push("\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 JSON \uAD6C\uC870\uAC00 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
        }
      } catch {
        warnings.push("\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 JSON \uD30C\uC2F1 \uC2E4\uD328");
      }
    } else if (text) {
      warnings.push("\uCFE0\uD321 \uC790\uB3D9\uC644\uC131 \uC751\uB2F5\uC774 JSON\uC774 \uC544\uB2D9\uB2C8\uB2E4");
    }
    const beforeDom = candidates.length;
    for (const link of evidence.links) {
      add(link.text, "coupang-search-dom");
      try {
        const parsed = new URL(link.href, origin);
        add(parsed.searchParams.get("q") || parsed.searchParams.get("keyword") || "", "coupang-search-dom");
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
    const record = value;
    if (record.success === false || record.ok === false) return true;
    for (const key of ["error", "errors", "errorCode", "error_code"]) {
      const nested = record[key];
      if (key in record && nested !== null && nested !== void 0 && String(nested).trim()) return true;
    }
    if (record.code !== void 0 && record.code !== null && record.code !== 0 && record.code !== "0" && String(record.code).trim() !== "") return true;
    return typeof record.message === "string" && PROVIDER_ATTENTION.test(record.message);
  }
  function errorEnvelopeMessage(value) {
    const record = value;
    for (const key of ["error", "errors", "message", "errorCode", "error_code", "code"]) {
      const nested = record[key];
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
    return [...counts.entries()].map(([keyword, count]) => ({ keyword, count })).sort((left, right) => right.count - left.count || left.keyword.localeCompare(right.keyword, "ko")).slice(0, maxResults);
  }

  // extensions/src/sites/coupang-search/index.ts
  var ORIGIN2 = "https://www.coupang.com";
  var PAGE_TIMEOUT_MS = 6e4;
  var EVIDENCE_TIMEOUT_MS = 3e4;
  var SETTLE_MS = 1500;
  var CONTENT_FILE = "content/sourcing/coupang-search-page.js";
  function buildCoupangSearchUrl(keyword) {
    return `${ORIGIN2}/np/search?component=&q=${encodeURIComponent(keyword)}&channel=user`;
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
      async keywordSuggestions(keyword, maxResults) {
        const url = buildCoupangSearchUrl(keyword);
        const page = await tabs.open("about:blank");
        try {
          const landed = await page.navigate(url, { timeoutMs: PAGE_TIMEOUT_MS });
          if (!isCoupangSearchUrl(landed)) {
            throw new RuntimeError(SITE_LOGIN_REQUIRED, "\uCFE0\uD321 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uCFE0\uD321\uC5D0 \uB85C\uADF8\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url: landed });
          }
          await deps.sleep(SETTLE_MS);
          const evidence = await page.ask(
            { type: "KIDITEM_COUPANG_SEARCH_EVIDENCE", keyword },
            { timeoutMs: EVIDENCE_TIMEOUT_MS, inject: { isolated: [CONTENT_FILE] } }
          );
          if (!evidence.links || !evidence.productNames) {
            throw new RuntimeError(SITE_REQUEST_FAILED, `\uCFE0\uD321 \uAC80\uC0C9 \uD654\uBA74\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4(${evidence.error}).`, { status: null, url });
          }
          const parsed = parseCoupangSearchEvidence({ autocomplete: evidence.autocomplete ?? null, links: evidence.links, productNames: evidence.productNames }, keyword, maxResults);
          if (!parsed.ok) {
            throw new RuntimeError(
              parsed.reason === "no_evidence" ? SITE_REQUEST_FAILED : SITE_LOGIN_REQUIRED,
              parsed.message,
              { status: null, url, reason: parsed.reason, warnings: parsed.warnings }
            );
          }
          return { items: parsed.items, productNameTokens: parsed.productNameTokens, warnings: parsed.warnings };
        } finally {
          await page.close();
        }
      }
    };
  }

  // extensions/src/sites/live-commerce/index.ts
  var NAVIGATION_TIMEOUT_MS2 = 35e3;
  var EXTRACTION_TIMEOUT_MS2 = 25e3;
  var MAX_PRODUCTS = 100;
  var CONTENT_FILES = {
    isolated: ["content/sourcing/live-commerce-extractor.js", "content/sourcing/live-commerce-content.js"]
  };
  var SITE_VERIFICATION_REQUIRED2 = "SITE_VERIFICATION_REQUIRED";
  function isLiveVerificationUrl(value) {
    try {
      const url = new URL(value);
      return url.pathname.includes("/punish") || url.searchParams.get("action") === "captcha" || /(?:verify|captcha|login)/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function createLiveCommerceSite(tabs) {
    return {
      async broadcast(pageUrl) {
        const page = await tabs.open("about:blank");
        let keepOpen = false;
        try {
          const landed = await page.navigate(pageUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS2, stopAt: isLiveVerificationUrl });
          if (isLiveVerificationUrl(landed)) {
            keepOpen = true;
            throw verification2(landed);
          }
          const extracted = await page.ask(
            { type: "TRIGGER_LIVE_COMMERCE_EXTRACT" },
            { timeoutMs: EXTRACTION_TIMEOUT_MS2, inject: CONTENT_FILES }
          );
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
    return new RuntimeError(SITE_VERIFICATION_REQUIRED2, "\uBC29\uC1A1 \uD398\uC774\uC9C0\uAC00 \uB85C\uADF8\uC778\uC774\uB098 \uAC80\uC99D\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uC5F4\uB824 \uC788\uB294 \uD0ED\uC5D0\uC11C \uCC98\uB9AC\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url });
  }

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
      const text = match[1].replace(/&[^;]+;/g, " ").trim();
      if (text.length < 5 || text.length > 2e3 || seen.has(text)) continue;
      seen.add(text);
      blocks.push(text);
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
            const parsed = JSON.parse(html.substring(jsonStart, index + 1));
            return typeof parsed.content === "string" ? parsed.content : null;
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
      const parsed = new URL(String(value ?? "").trim());
      const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port && parsed.port !== "443") return null;
      if (!["1688.com", "alibaba.com"].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
      parsed.hostname = host;
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // extensions/src/sites/product-page/index.ts
  var EXTRACTION_TIMEOUT_MS3 = 2e4;
  var TRIGGER_TIMEOUT_MS = 5e3;
  var EXTRACTOR_FILES = [
    "content/sourcing/extractors/common.js",
    "content/sourcing/extractors/alibaba.js",
    "content/sourcing/extractors/1688.js",
    "content/sourcing/content.js"
  ];
  var PRODUCT_PAGE_MOVED = "PRODUCT_PAGE_MOVED";
  var PRODUCT_EXTRACTION_TIMEOUT = "PRODUCT_EXTRACTION_TIMEOUT";
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
        const timer = setTimeout(() => settle(new RuntimeError(PRODUCT_EXTRACTION_TIMEOUT, "\uC0C1\uD488 \uCD94\uCD9C \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68\uD55C \uB4A4 \uB2E4\uC2DC \uC218\uC9D1\uD574 \uC8FC\uC138\uC694.", { url: sourceUrl })), EXTRACTION_TIMEOUT_MS3);
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

  // extensions/src/sites/tiktok-cc/index.ts
  var NAVIGATION_TIMEOUT_MS3 = 35e3;
  var EXTRACTION_TIMEOUT_MS4 = 25e3;
  var BASE_URLS = {
    hashtag: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
    product: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en",
    keyword: "https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en"
  };
  var CONTENT_FILES2 = {
    isolated: ["content/sourcing/tiktok-cc-extractor.js", "content/sourcing/tiktok-cc-content.js"],
    main: ["content/sourcing/tiktok-cc-hook.js"]
  };
  function tiktokTargetFor(targetId) {
    if (targetId === "hashtag" || targetId === "product") {
      return { id: targetId, trendType: targetId, url: BASE_URLS[targetId], sourceKeyword: null };
    }
    const keyword = targetId.startsWith("keyword:") ? targetId.slice("keyword:".length) : targetId;
    return { id: targetId, trendType: "keyword", url: `${BASE_URLS.keyword}?keyword=${encodeURIComponent(keyword)}`, sourceKeyword: keyword };
  }
  function isTiktokBlockedUrl(value) {
    try {
      return /(?:\/login|\/passport|\/signup)/i.test(new URL(value).pathname);
    } catch {
      return false;
    }
  }
  function sanitizeTiktokRegion(value) {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/[^A-Za-z]/g, "").toUpperCase();
    return cleaned.length >= 2 && cleaned.length <= 8 ? cleaned : null;
  }
  function createTiktokCcSite(tabs) {
    let page = null;
    return {
      targetFor: tiktokTargetFor,
      async target(target, defaultRegion) {
        page ??= await tabs.open("about:blank");
        const landed = await page.navigate(target.url, { timeoutMs: NAVIGATION_TIMEOUT_MS3, stopAt: isTiktokBlockedUrl });
        if (isTiktokBlockedUrl(landed)) {
          throw new RuntimeError(SITE_LOGIN_REQUIRED, "TikTok \uB85C\uADF8\uC778 \uB610\uB294 \uC9C0\uC5ED \uCC28\uB2E8\uC73C\uB85C \uC218\uC9D1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { url: landed, target: target.id });
        }
        const extracted = await page.ask(
          { type: "TRIGGER_TIKTOK_CC_EXTRACT", trendType: target.trendType, sourceKeyword: target.sourceKeyword, defaultRegion },
          { timeoutMs: EXTRACTION_TIMEOUT_MS4, inject: CONTENT_FILES2 }
        );
        if (!extracted.ok) {
          throw new RuntimeError(SITE_REQUEST_FAILED, `TikTok \uD2B8\uB80C\uB4DC '${target.id}'\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${extracted.error ?? "\uC54C \uC218 \uC5C6\uC74C"}`, { status: null, target: target.id });
        }
        return {
          region: sanitizeTiktokRegion(extracted.region),
          items: (Array.isArray(extracted.items) ? extracted.items : []).filter((item) => Boolean(item) && typeof item === "object")
        };
      },
      async close() {
        await page?.close();
        page = null;
      }
    };
  }

  // extensions/src/entry/sourcing-site-handles.ts
  var PRODUCT_TAB_REQUIRED = "PRODUCT_TAB_REQUIRED";
  function createSourcingSiteHandles(deps, productTabId = null) {
    return (kind) => {
      switch (collectorFor(kind)?.site ?? null) {
        case WING_SEARCH_SITE.name:
          return createWingCatalogSearchSite(createSiteCaller(WING_SEARCH_SITE.caller, deps), { sleep: deps.sleep });
        case "coupang-search":
          return createCoupangSearchSite(deps.tabs, { sleep: deps.sleep });
        case "ali1688":
          return create1688SearchSite(deps.tabs);
        case "live-commerce":
          return createLiveCommerceSite(deps.tabs);
        case "tiktok":
          return createTiktokCcSite(deps.tabs);
        case "product-page":
          if (productTabId !== null) return createProductPageSite(deps.tabs, productTabId, { randomId: deps.randomId });
          return {
            extract: async () => {
              throw new RuntimeError(PRODUCT_TAB_REQUIRED, "\uC0C1\uD488 \uC218\uC9D1\uC740 \uD655\uC7A5 \uD31D\uC5C5\uC758 [\uD604\uC7AC \uC0C1\uD488 \uC218\uC9D1]\uC5D0\uC11C \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
            }
          };
        default:
          return null;
      }
    };
  }

  // extensions/src/entry/sourcing-product-collect.ts
  var COLLECT_CURRENT = "COLLECT_CURRENT";
  var HOST_KEEPALIVE_PORT = "kiditem-1688-trend-keepalive";
  function productExtensionScope(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return null;
      const host = parsed.hostname.toLowerCase();
      if (host === "1688.com" || host.endsWith(".1688.com")) return { platform: "1688", url: parsed.toString() };
      if (host === "alibaba.com" || host.endsWith(".alibaba.com")) return { platform: "alibaba", url: parsed.toString() };
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
      siteFor: createSourcingSiteHandles(deps.site, input.tabId)
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
      const record = message && typeof message === "object" ? message : null;
      if (record?.type !== COLLECT_CURRENT) return;
      const tabId = record.tabId;
      const environmentId = record.environmentId;
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
    const browser = createBrowserResources(chrome, { [WING_SEARCH_SITE.name]: { origin: WING_SEARCH_SITE.origin } }, { accountSite: WING_SEARCH_SITE.name });
    const externalActions = createOperationActions({
      apiFor: legacyApiPort,
      browser,
      siteFor: createSourcingSiteHandles(site),
      keepAlive: legacyKeepAlive
    });
    registerWithLegacyDomains({ externalActions, capabilities: { operationRuntime: true } });
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
