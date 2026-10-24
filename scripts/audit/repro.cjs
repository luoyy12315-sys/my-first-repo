"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/audit/repro.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var import_better_sqlite32 = __toESM(require("better-sqlite3"));

// src/lib/db/index.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"));

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
    const obj2 = {};
    for (const item of items) {
      obj2[item] = item;
    }
    return obj2;
  };
  util2.getValidEnumValues = (obj2) => {
    const validKeys = util2.objectKeys(obj2).filter((k) => typeof obj2[obj2[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj2[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj2) => {
    return util2.objectKeys(obj2).map(function(e) {
      return obj2[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj2) => Object.keys(obj2) : (object) => {
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
var quotelessJson = (obj2) => {
  const json = JSON.stringify(obj2, null, 2);
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
  const { data, path: path2, errorMaps, issueData } = params;
  const fullPath = [...path2, ...issueData.path || []];
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
  constructor(parent, value, path2, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path2;
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
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
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
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
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

// src/lib/blocks/schema.ts
var exerciseTypeSchema = external_exports.enum([
  "single",
  "multi",
  "blank",
  "judge",
  "order",
  "numeric",
  "steps",
  "open"
]);
var exerciseInputSchema = external_exports.object({
  concept: external_exports.string().min(1).max(120).optional(),
  topic: external_exports.string().min(1).max(80).optional(),
  type: exerciseTypeSchema,
  prompt: external_exports.string().min(3).max(4e3),
  options: external_exports.array(external_exports.string().min(1).max(400)).max(10).optional(),
  blanks: external_exports.number().int().min(1).max(8).optional(),
  steps: external_exports.array(external_exports.string().min(1).max(400)).max(10).optional(),
  unit: external_exports.string().max(30).optional(),
  /** single: "0" ; multi: "0,2" ; blank: "甲||乙" ; judge: "true" ; order: "2,0,1" ; numeric: "3.14" ; steps: "1||3||x=2" */
  answer: external_exports.string().min(1).max(2e3),
  /** 可接受的等价答案，用 || 分隔 */
  accept: external_exports.array(external_exports.string().max(200)).max(10).optional(),
  tolerance: external_exports.number().min(0).max(1e3).optional(),
  /** 学生点「给我提示」时展示的渐进提示（不得直接给出答案） */
  hint: external_exports.string().max(600).optional(),
  explanation: external_exports.string().max(3e3).optional(),
  difficulty: external_exports.number().int().min(1).max(5).optional(),
  rubric: external_exports.array(external_exports.string().min(1).max(200)).max(6).optional()
}).superRefine((v, ctx) => {
  if ((v.type === "single" || v.type === "multi") && (!v.options || v.options.length < 2)) {
    ctx.addIssue({ code: "custom", message: "\u9009\u62E9\u9898\u5FC5\u987B\u63D0\u4F9B\u81F3\u5C11 2 \u4E2A\u9009\u9879" });
  }
  if (v.type === "order" && (!v.options || v.options.length < 2)) {
    ctx.addIssue({ code: "custom", message: "\u6392\u5E8F\u9898\u5FC5\u987B\u63D0\u4F9B\u81F3\u5C11 2 \u4E2A\u9879\u76EE" });
  }
  if (v.type === "steps" && (!v.steps || v.steps.length < 1)) {
    ctx.addIssue({ code: "custom", message: "\u5206\u6B65\u9AA4\u7EC3\u4E60\u5FC5\u987B\u7ED9\u51FA\u6B65\u9AA4\u5217\u8868" });
  }
  if (v.type === "blank" && (v.answer.split("||").length < 1 || v.answer.trim() === "")) {
    ctx.addIssue({ code: "custom", message: "\u586B\u7A7A\u9898\u7B54\u6848\u4E0D\u80FD\u4E3A\u7A7A" });
  }
});
var quizInputSchema = external_exports.object({
  title: external_exports.string().min(1).max(160),
  concept: external_exports.string().min(1).max(120).optional(),
  topic: external_exports.string().min(1).max(80).optional(),
  questions: external_exports.array(external_exports.unknown()).min(2).max(5)
});
var pointSchema = external_exports.object({ x: external_exports.number(), y: external_exports.number() });
var chartInputSchema = external_exports.object({
  title: external_exports.string().min(1).max(160),
  chartType: external_exports.enum(["line", "bar", "scatter"]).default("line"),
  xLabel: external_exports.string().max(60).optional(),
  yLabel: external_exports.string().max(60).optional(),
  series: external_exports.array(
    external_exports.object({
      name: external_exports.string().min(1).max(60),
      points: external_exports.array(pointSchema).min(1).max(200)
    })
  ).min(1).max(6),
  note: external_exports.string().max(600).optional()
});
var tableInputSchema = external_exports.object({
  title: external_exports.string().min(1).max(160),
  columns: external_exports.array(external_exports.string().min(1).max(80)).min(2).max(8),
  rows: external_exports.array(external_exports.array(external_exports.string().max(400)).min(2).max(8)).min(1).max(60),
  note: external_exports.string().max(600).optional()
});
var stepsInputSchema = external_exports.object({
  title: external_exports.string().min(1).max(160),
  steps: external_exports.array(
    external_exports.object({
      title: external_exports.string().min(1).max(120),
      detail: external_exports.string().max(1200).optional()
    })
  ).min(2).max(10),
  note: external_exports.string().max(600).optional()
});
var simulatorParamSchema = external_exports.object({
  key: external_exports.string().min(1).max(24).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "\u53C2\u6570\u540D\u5FC5\u987B\u662F\u5408\u6CD5\u53D8\u91CF\u540D"),
  label: external_exports.string().min(1).max(40),
  min: external_exports.number(),
  max: external_exports.number(),
  step: external_exports.number().positive(),
  default: external_exports.number(),
  unit: external_exports.string().max(16).optional()
});
var simulatorInputSchema = external_exports.object({
  title: external_exports.string().min(1).max(160),
  description: external_exports.string().max(1200).optional(),
  /** 表达式，可引用 params 中的变量；用于输出与绘图，不支持任意代码 */
  expression: external_exports.string().min(1).max(400).optional(),
  params: external_exports.array(simulatorParamSchema).min(1).max(6),
  outputs: external_exports.array(
    external_exports.object({
      key: external_exports.string().min(1).max(24),
      label: external_exports.string().min(1).max(40),
      expression: external_exports.string().min(1).max(300),
      unit: external_exports.string().max(16).optional(),
      digits: external_exports.number().int().min(0).max(6).optional()
    })
  ).max(6).optional(),
  /** 绘制曲线：x 轴变量取自 params，y = expression */
  plot: external_exports.object({
    xKey: external_exports.string().min(1).max(24),
    expression: external_exports.string().min(1).max(300),
    xLabel: external_exports.string().max(40).optional(),
    yLabel: external_exports.string().max(40).optional()
  }).optional(),
  insight: external_exports.string().max(800).optional()
}).superRefine((v, ctx) => {
  const keys = new Set(v.params.map((p) => p.key));
  for (const p of v.params) {
    if (p.min >= p.max) ctx.addIssue({ code: "custom", message: `\u53C2\u6570 ${p.key} \u7684 min \u5FC5\u987B\u5C0F\u4E8E max` });
    if (p.default < p.min || p.default > p.max)
      ctx.addIssue({ code: "custom", message: `\u53C2\u6570 ${p.key} \u7684\u9ED8\u8BA4\u503C\u8D85\u51FA\u8303\u56F4` });
  }
  if (v.plot && !keys.has(v.plot.xKey)) {
    ctx.addIssue({ code: "custom", message: "plot.xKey \u5FC5\u987B\u662F\u5DF2\u58F0\u660E\u7684\u53C2\u6570" });
  }
});
var conceptInputSchema = external_exports.object({
  name: external_exports.string().min(1).max(120),
  definition: external_exports.string().max(600).optional(),
  prerequisites: external_exports.array(external_exports.string().max(120)).max(6).optional()
});
var conceptsInputSchema = external_exports.object({
  topic: external_exports.string().min(1).max(80),
  topicDescription: external_exports.string().max(400).optional(),
  concepts: external_exports.array(conceptInputSchema).min(1).max(8)
});
var planInputSchema = external_exports.object({
  title: external_exports.string().min(1).max(160),
  goal: external_exports.string().max(400).optional(),
  courses: external_exports.array(
    external_exports.object({
      title: external_exports.string().min(1).max(160),
      description: external_exports.string().max(600).optional(),
      concepts: external_exports.array(
        external_exports.object({
          name: external_exports.string().min(1).max(120),
          definition: external_exports.string().max(600).optional()
        })
      ).min(1).max(12)
    })
  ).min(1).max(12)
});
var summaryInputSchema = external_exports.object({
  headline: external_exports.string().min(1).max(160),
  covered: external_exports.array(external_exports.string().max(200)).max(10).default([]),
  progress: external_exports.array(external_exports.string().max(240)).max(10).default([]),
  needsWork: external_exports.array(external_exports.string().max(200)).max(10).default([]),
  nextSteps: external_exports.array(external_exports.string().max(240)).max(6).default([]),
  resumeHint: external_exports.string().max(300).optional()
});

// src/lib/ai/prompt.ts
var SYSTEM_PROMPT = `\u4F60\u662F Lumina\uFF0C\u4E00\u540D\u771F\u6B63\u4F1A\u6559\u4EBA\u7684\u79C1\u4EBA\u5BFC\u5E08\u3002\u4F60\u4E0D\u662F\u95EE\u7B54\u673A\u5668\u4EBA\uFF0C\u4E5F\u4E0D\u662F\u8BFE\u7A0B\u64AD\u653E\u5668\u3002

# \u4F60\u7684\u5224\u65AD\u987A\u5E8F
\u6BCF\u6B21\u56DE\u590D\u524D\uFF0C\u5148\u5728\u5FC3\u91CC\u5224\u65AD\uFF08\u4E0D\u8981\u8F93\u51FA\u8FD9\u6BB5\u601D\u8003\uFF09\uFF1A
1. \u5B66\u751F\u8FD9\u6B21\u8981\u7684\u662F"\u89E3\u51B3\u773C\u524D\u8FD9\u4E2A\u95EE\u9898"\uFF0C\u8FD8\u662F\u8981"\u7CFB\u7EDF\u5B66\u4E00\u5757\u5185\u5BB9"\uFF1F
2. \u4ED6\u73B0\u5728\u5361\u5728\u54EA\u91CC\uFF1A\u6982\u5FF5\u6CA1\u5EFA\u7ACB\u3001\u6982\u5FF5\u6DF7\u6DC6\u3001\u8FD8\u662F\u8BA1\u7B97/\u64CD\u4F5C\u5931\u8BEF\uFF1F
3. \u8FD9\u4E00\u8F6E\u6700\u6709\u6548\u7684\u52A8\u4F5C\u662F\u4EC0\u4E48\uFF1A\u76F4\u63A5\u56DE\u7B54 / \u6362\u4E2A\u8BB2\u6CD5 / \u7ED9\u4F8B\u5B50 / \u753B\u56FE\u8868 / \u51FA\u7EC3\u4E60 / \u7ED9\u63D0\u793A / \u6307\u51FA\u9519\u8BEF / \u63A8\u8FDB\u5230\u4E0B\u4E00\u6B65\uFF1F

\u53EA\u505A\u5F53\u524D\u6700\u6709\u7528\u7684\u90A3\u4E00\u4EF6\u4E8B\u3002\u7B80\u5355\u95EE\u9898\u5C31\u76F4\u63A5\u56DE\u7B54\uFF0C\u4E0D\u8981\u5F3A\u884C\u63D2\u5165\u5B66\u4E60\u8BA1\u5212\u3001\u7EC3\u4E60\u9898\u6216\u5B66\u4E60\u62A5\u544A\u3002
\u5982\u679C\u5B66\u751F\u8BF4"\u53EA\u56DE\u7B54\u6211\u7684\u95EE\u9898"\uFF0C\u5C31\u53EA\u56DE\u7B54\uFF0C\u4E0D\u8981\u5B89\u6392\u8BFE\u7A0B\u3002

# \u6559\u5B66\u539F\u5219
- \u5148\u786E\u8BA4\u7406\u89E3\uFF0C\u518D\u5F80\u4E0B\u63A8\u3002\u5B66\u751F\u7B54\u9519\u65F6\uFF0C\u5148\u5224\u65AD\u9519\u56E0\uFF08\u6982\u5FF5\u9519\u3001\u6DF7\u6DC6\u3001\u7C97\u5FC3\u3001\u9898\u76EE\u6B67\u4E49\uFF09\uFF0C\u518D\u51B3\u5B9A\u600E\u4E48\u7EA0\u6B63\u3002
- \u540C\u4E00\u4E2A\u6982\u5FF5\u4E0D\u8981\u7528\u540C\u4E00\u5957\u8BDD\u53CD\u590D\u8BB2\u3002\u5B66\u751F\u6CA1\u542C\u61C2\u65F6\uFF0C\u6362\u8868\u5F81\uFF1A\u5177\u4F53\u4F8B\u5B50\u3001\u56FE\u793A\u3001\u8868\u683C\u5BF9\u6BD4\u3001\u53EF\u8C03\u53C2\u6570\u7684\u6A21\u62DF\u5668\u3001\u5206\u6B65\u6F14\u793A\u3002
- \u4E0D\u8981\u5728\u5B66\u751F\u63D0\u4EA4\u524D\u6CC4\u9732\u7B54\u6848\u3002\u4F60\u53EF\u4EE5\u5728\u8BB2\u89E3\u91CC\u6F14\u793A\u540C\u7C7B\u9898\uFF0C\u4F46\u4E0D\u80FD\u628A\u5F53\u524D\u8FD9\u9053\u9898\u7684\u7B54\u6848\u5199\u8FDB\u5BF9\u8BDD\u3002
- \u4E0D\u8981\u628A\u6240\u6709\u9519\u8BEF\u90FD\u5F52\u56E0\u4E8E"\u5B66\u751F\u4E0D\u8BA4\u771F"\u3002\u5982\u679C\u9898\u76EE\u672C\u8EAB\u6709\u6B67\u4E49\u6216\u96BE\u5EA6\u4E0D\u5408\u9002\uFF0C\u660E\u786E\u8BF4\u51FA\u6765\u3002
- \u4E0D\u786E\u5B9A\u7684\u5185\u5BB9\u8981\u8BF4\u4E0D\u786E\u5B9A\uFF1B\u7528\u6237\u6750\u6599\u4E0E\u4F60\u7684\u901A\u7528\u77E5\u8BC6\u51B2\u7A81\u65F6\uFF0C\u6307\u51FA\u5DEE\u5F02\uFF0C\u4E0D\u8981\u6DF7\u4E3A\u4E00\u8C08\u3002
- \u4E0D\u7F16\u9020\u9875\u7801\u3001\u539F\u6587\u3001\u5F15\u7528\u3001\u7EDF\u8BA1\u6570\u636E\u3002\u6CA1\u6709\u4F9D\u636E\u5C31\u8BF4\u6CA1\u6709\u4F9D\u636E\u3002

# \u4E24\u79CD\u5B66\u4E60\u6A21\u5F0F\uFF08\u670D\u52A1\u7AEF\u4F1A\u544A\u8BC9\u4F60\u662F\u54EA\u4E00\u79CD\uFF09
- \u65E0\u9650\u5B66\u4E60\uFF1A\u5B66\u751F\u5728\u5BF9\u8BDD\u91CC\u76F4\u63A5\u5B66\u3002\u4F60\u53EF\u4EE5\u8FDE\u7EED\u8BB2\u89E3\u3001\u8FFD\u95EE\u3001\u4E3E\u4F8B\u3001\u51FA\u7EC3\u4E60\uFF0C\u4F46\u4E0D\u521B\u5EFA\u6B63\u5F0F\u8BA1\u5212\u3001\u4E0D\u5199\u5165\u5B66\u4E60\u6863\u6848\u3001\u4E0D\u5C55\u793A\u8BFE\u7A0B\u5B8C\u6210\u7387\u3002\u7EC3\u4E60\u53EA\u7528\u4E8E\u5F53\u4E0B\u7406\u89E3\u3002
- \u76EE\u6807\u5B66\u4E60\uFF1A\u5B66\u751F\u5728\u4E00\u6761\u5DF2\u786E\u8BA4\u7684\u8BA1\u5212\u91CC\uFF0C\u6309\u300C\u8BFE\u7A0B \u2192 \u77E5\u8BC6\u70B9\u300D\u9010\u6B65\u5B66\u4E60\u3002\u4E00\u6B21\u53EA\u805A\u7126\u4E00\u4E2A\u77E5\u8BC6\u70B9\uFF1B\u51FA\u9898\u8BC1\u636E\u4F1A\u66F4\u65B0\u8BFE\u7A0B\u4E0E\u8BA1\u5212\u8FDB\u5EA6\u3002\u672A\u786E\u8BA4\u7684\u8BA1\u5212\u8349\u7A3F\u4E0D\u80FD\u5F00\u59CB\u6559\u5B66\u3002
- \u590D\u4E60\uFF1A\u53EA\u68C0\u9A8C\u5DF2\u6709\u77E5\u8BC6\u70B9\uFF0C\u4E0D\u65B0\u5EFA\u8BA1\u5212\u6216\u77E5\u8BC6\u70B9\u3002

# \u5DE5\u5177\uFF08\u91CD\u8981\uFF09
\u4F60\u80FD\u8C03\u7528\u7684\u5DE5\u5177\u662F\u4F60\u8F93\u51FA"\u53EF\u4EA4\u4E92\u6559\u5B66\u5185\u5BB9"\u7684\u552F\u4E00\u65B9\u5F0F\uFF1A
- save_concepts\uFF1A\u4EC5\u76EE\u6807\u5B66\u4E60\u4E14\u5DF2\u7ED1\u5B9A\u8BFE\u7A0B\u65F6\u8C03\u7528\uFF1B\u628A\u672C\u8F6E\u6D89\u53CA\u3001\u4E14\u5DF2\u5728\u5F53\u524D\u8BFE\u7A0B\u4E2D\u7684\u77E5\u8BC6\u70B9\u6807\u8BB0\u4E3A\u5DF2\u8BB2\u89E3\u5E76\u5173\u8054\u4F1A\u8BDD\u3002\u4E0D\u8981\u7528\u5B83\u6269\u8BFE\u7A0B\u76EE\u5F55\uFF0C\u65B0\u77E5\u8BC6\u70B9\u7531\u7528\u6237\u5728\u8BA1\u5212\u9875\u6DFB\u52A0\u3002
- present_exercise\uFF1A\u9700\u8981\u9A8C\u8BC1\u7406\u89E3\u65F6\u51FA\u4E00\u9053\u9898\u3002\u7B54\u6848\u5199\u5728 answer \u53C2\u6570\u91CC\uFF08\u53EA\u7ED9\u7CFB\u7EDF\uFF09\uFF0C\u7EDD\u4E0D\u8981\u5199\u8FDB\u6B63\u6587\u3002\u65E0\u9650\u5B66\u4E60\u4E2D\u5B83\u53EA\u4EA7\u751F\u5373\u65F6\u7EC3\u4E60\uFF0C\u4E0D\u5199\u6863\u6848\u3002\u76EE\u6807\u5B66\u4E60\u4E2D concept \u5FC5\u987B\u662F\u5F53\u524D\u8BFE\u7A0B\u5DF2\u6709\u77E5\u8BC6\u70B9\u3002
- present_quiz\uFF1A\u5B66\u751F\u8981\u6C42\u300C\u5C0F\u6D4B / \u4E00\u5957\u9898 / \u9636\u6BB5\u9A8C\u6536\u300D\u65F6\uFF0C\u4E00\u6B21\u51FA 2\u20135 \u9053\u786E\u5B9A\u6027\u9898\uFF1B\u6BCF\u9898\u53EF\u6307\u5B9A\u5F53\u524D\u8BFE\u7A0B\u4E2D\u7684\u77E5\u8BC6\u70B9\u3002\u7B54\u6848\u540C\u6837\u53EA\u7ED9\u7CFB\u7EDF\uFF0C\u4E0D\u8981\u7528 open \u9898\u3002
- present_chart / present_table / present_steps\uFF1A\u53EF\u89C6\u5316\u5BF9\u6BD4\u3001\u6570\u636E\u3001\u6D41\u7A0B\u3002\u6570\u636E\u5FC5\u987B\u771F\u5B9E\u3002
- open_simulator\uFF1A\u9700\u8981"\u52A8\u624B\u8C03\u53C2\u6570\u89C2\u5BDF\u89C4\u5F8B"\u65F6\u7528\u3002\u516C\u5F0F\u53D8\u91CF\u540D\u5FC5\u987B\u4E0E\u53C2\u6570 key \u4E00\u81F4\u3002
- save_plan\uFF1A\u53EA\u5728\u5B66\u751F\u660E\u786E\u8981\u6C42\u5236\u5B9A/\u8C03\u6574\u76EE\u6807\u5B66\u4E60\u8BA1\u5212\u65F6\u8C03\u7528\u3002\u751F\u6210\u7684\u662F\u5F85\u786E\u8BA4\u7684\u8BA1\u5212\u8349\u7A3F\uFF08\u8BA1\u5212 \u2192 \u8BFE\u7A0B \u2192 \u77E5\u8BC6\u70B9\uFF09\uFF0C\u4E0D\u4F1A\u76F4\u63A5\u5F00\u59CB\u6559\u5B66\uFF1B\u751F\u6210\u540E\u5FC5\u987B\u5F15\u5BFC\u7528\u6237\u53BB\u786E\u8BA4\u3002
- write_summary\uFF1A\u672C\u6B21\u5B66\u4E60\u7ED3\u675F\u6216\u9636\u6BB5\u603B\u7ED3\u65F6\u7528\uFF0Cprogress \u53EA\u80FD\u5199\u771F\u5B9E\u53D1\u751F\u7684\u4E8B\u3002

\u5DE5\u5177\u662F"\u5C55\u793A"\uFF0C\u4E0D\u662F"\u66FF\u4EE3\u8BB2\u89E3"\uFF1A\u5148\u7ED9\u4E00\u4E24\u53E5\u4EBA\u8BDD\u89E3\u91CA\u4F60\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u505A\uFF0C\u518D\u8C03\u7528\u5DE5\u5177\u3002
\u4E00\u4E2A\u56DE\u5408\u4E0D\u8981\u5806\u780C\u8D85\u8FC7 3 \u4E2A\u5DE5\u5177\u3002\u6559\u5B66\u5185\u5BB9\u4EE5\u5B66\u751F\u80FD\u6D88\u5316\u4E3A\u51C6\uFF0C\u4E0D\u4EE5\u6570\u91CF\u53D6\u80DC\u3002
\u5386\u53F2\u6D88\u606F\u91CC\u7684\u300C\u6B64\u524D\u5C55\u793A\u8FC7\u2026\u7EC4\u4EF6\u300D\u53EA\u662F\u4E0A\u4E0B\u6587\u8BF4\u660E\uFF1A\u4E0D\u8981\u628A\u5B83\u590D\u8FF0\u8FDB\u6B63\u6587\uFF0C\u4E5F\u4E0D\u8981\u5199\u7EC4\u4EF6\u5360\u4F4D\u7B26\uFF1B\u5982\u679C\u786E\u5B9E\u9700\u8981\u518D\u6B21\u5C55\u793A\uFF0C\u8BF7\u91CD\u65B0\u8C03\u7528\u5BF9\u5E94\u5DE5\u5177\u3002

# \u8868\u8FBE
- \u7528 markdown\u3002\u516C\u5F0F\u7528 $...$ \u6216 $$...$$\u3002\u4EE3\u7801\u7528\u4EE3\u7801\u5757\u3002
- \u4E2D\u6587\u63D0\u95EE\u5C31\u7528\u4E2D\u6587\u56DE\u7B54\uFF0C\u5176\u4ED6\u8BED\u8A00\u540C\u7406\u3002
- \u522B\u5199"\u4F5C\u4E3A\u4E00\u4E2AAI"\u8FD9\u7C7B\u5E9F\u8BDD\uFF0C\u522B\u7528\u7A7A\u6D1E\u7684\u9F13\u52B1\u4EE3\u66FF\u771F\u5B9E\u53CD\u9988\u3002
- \u7BC7\u5E45\u8DDF\u7740\u95EE\u9898\u8D70\uFF1A\u6982\u5FF5\u95EE\u9898\u53EF\u4EE5\u4E24\u4E09\u6BB5\uFF0C\u64CD\u4F5C\u95EE\u9898\u4E00\u53E5\u8BDD\u5C31\u591F\u3002`;

// src/lib/ai/config.ts
function isLocalEndpoint(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  } catch {
    return false;
  }
}
var AiError = class extends Error {
  code;
  detail;
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
};

// src/lib/ai/provider.ts
async function readError(res) {
  try {
    const text = await res.text();
    return text.slice(0, 600);
  } catch {
    return "";
  }
}
function mapHttpError(status, body) {
  if (status === 401 || status === 403) return new AiError("AI_UNAUTHORIZED", "\u6A21\u578B\u670D\u52A1\u9274\u6743\u5931\u8D25", body);
  if (status === 429) return new AiError("AI_RATE_LIMIT", "\u6A21\u578B\u670D\u52A1\u9650\u6D41", body);
  if (status >= 500) return new AiError("AI_NETWORK", "\u6A21\u578B\u670D\u52A1\u5F02\u5E38", body);
  return new AiError("AI_BAD_RESPONSE", `\u6A21\u578B\u670D\u52A1\u8FD4\u56DE ${status}`, body);
}
async function streamChat(opts) {
  const { config: config2 } = opts;
  if (!config2.apiKey && !isLocalEndpoint(config2.baseUrl)) {
    throw new AiError("AI_NOT_CONFIGURED", "\u7F3A\u5C11 API Key");
  }
  if (!config2.model) throw new AiError("AI_NOT_CONFIGURED", "\u7F3A\u5C11\u6A21\u578B\u540D\u79F0");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), config2.timeoutMs);
  const onAbort = () => controller.abort(new Error("aborted"));
  opts.signal?.addEventListener("abort", onAbort);
  try {
    const result = config2.provider === "anthropic" ? await streamAnthropic({ ...opts, signal: controller.signal }) : await streamOpenAI({ ...opts, signal: controller.signal });
    return result;
  } catch (e) {
    const err = e;
    if (err instanceof AiError) throw err;
    if (err.name === "AbortError" || String(err.message).includes("aborted")) {
      throw new AiError("AI_ABORTED", "\u8BF7\u6C42\u88AB\u4E2D\u6B62");
    }
    if (String(err.message).includes("timeout")) {
      throw new AiError("AI_TIMEOUT", "\u6A21\u578B\u54CD\u5E94\u8D85\u65F6");
    }
    throw new AiError("AI_NETWORK", err.message || "\u7F51\u7EDC\u9519\u8BEF");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
async function streamOpenAI(opts) {
  const { config: config2, messages, tools: tools2, onText, jsonMode } = opts;
  const body = {
    model: config2.model,
    messages: messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((t) => ({
            id: t.id,
            type: "function",
            function: { name: t.name, arguments: t.arguments }
          }))
        };
      }
      return { role: m.role, content: m.content };
    }),
    stream: true,
    temperature: config2.temperature,
    max_tokens: config2.maxTokens,
    stream_options: { include_usage: true }
  };
  if (tools2?.length) {
    body.tools = tools2.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));
    body.tool_choice = "auto";
  }
  if (jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch(`${config2.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...config2.apiKey ? { authorization: `Bearer ${config2.apiKey}` } : {}
    },
    body: JSON.stringify(body),
    signal: opts.signal
  });
  if (!res.ok) throw mapHttpError(res.status, await readError(res));
  if (!res.body) throw new AiError("AI_BAD_RESPONSE", "\u54CD\u5E94\u6CA1\u6709\u5185\u5BB9");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const calls = [];
  let finishReason = null;
  let usage;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const errObj = json.error;
      if (errObj) throw new AiError("AI_BAD_RESPONSE", errObj.message || "\u6A21\u578B\u8FD4\u56DE\u9519\u8BEF");
      const u = json.usage;
      if (u) usage = { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0 };
      const choice = json.choices?.[0];
      if (!choice) continue;
      finishReason = choice.finish_reason ?? finishReason;
      const delta = choice.delta;
      if (!delta) continue;
      const content = delta.content;
      if (typeof content === "string" && content.length) {
        text += content;
        onText?.(content);
      }
      const toolDeltas = delta.tool_calls;
      if (toolDeltas) {
        for (const td of toolDeltas) {
          const idx = td.index ?? 0;
          if (!calls[idx]) calls[idx] = { id: td.id ?? `call_${idx}`, name: "", arguments: "" };
          if (td.id) calls[idx].id = td.id;
          if (td.function?.name) calls[idx].name += td.function.name;
          if (td.function?.arguments) calls[idx].arguments += td.function.arguments;
        }
      }
    }
  }
  return {
    text,
    toolCalls: calls.filter((c) => c && c.name),
    finishReason,
    usage
  };
}
async function streamAnthropic(opts) {
  const { config: config2, messages, tools: tools2, onText } = opts;
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      rest.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }]
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      rest.push({
        role: "assistant",
        content: [
          ...m.content ? [{ type: "text", text: m.content }] : [],
          ...m.toolCalls.map((t) => ({
            type: "tool_use",
            id: t.id,
            name: t.name,
            input: safeParse(t.arguments)
          }))
        ]
      });
      continue;
    }
    rest.push({ role: m.role, content: m.content });
  }
  const body = {
    model: config2.model,
    system,
    messages: rest,
    max_tokens: config2.maxTokens,
    temperature: config2.temperature,
    stream: true
  };
  if (tools2?.length) {
    body.tools = tools2.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));
  }
  const res = await fetch(`${config2.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...config2.apiKey ? { "x-api-key": config2.apiKey } : {},
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body),
    signal: opts.signal
  });
  if (!res.ok) throw mapHttpError(res.status, await readError(res));
  if (!res.body) throw new AiError("AI_BAD_RESPONSE", "\u54CD\u5E94\u6CA1\u6709\u5185\u5BB9");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const calls = [];
  let finishReason = null;
  let usage;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      let json;
      try {
        json = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      const type = json.type;
      if (type === "content_block_start") {
        const block = json.content_block;
        if (block?.type === "tool_use") {
          calls.push({ id: block.id ?? `call_${calls.length}`, name: block.name ?? "", arguments: "" });
        }
      } else if (type === "content_block_delta") {
        const delta = json.delta;
        if (delta?.type === "text_delta" && delta.text) {
          text += delta.text;
          onText?.(delta.text);
        } else if (delta?.type === "input_json_delta" && delta.partial_json) {
          if (calls.length) calls[calls.length - 1].arguments += delta.partial_json;
        }
      } else if (type === "message_delta") {
        const d = json.delta;
        finishReason = d?.stop_reason ?? finishReason;
        const u = json.usage;
        if (u) usage = { promptTokens: u.input_tokens ?? 0, completionTokens: u.output_tokens ?? 0 };
      }
    }
  }
  return { text, toolCalls: calls.filter((c) => c.arguments !== "" || c.name), finishReason, usage };
}
function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// src/lib/ai/exercise-verify.ts
var verdictSchema = external_exports.object({
  verdict: external_exports.enum(["pass", "ambiguous", "fail"]),
  problems: external_exports.array(external_exports.string().max(200)).max(6).optional(),
  note: external_exports.string().max(200).optional()
});

// src/lib/ai/tools.ts
var obj = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});
var TEACHING_TOOLS = [
  {
    name: "save_concepts",
    description: "\u628A\u672C\u8F6E\u8BB2\u89E3\u6D89\u53CA\u3001\u4E14\u5DF2\u7ECF\u5C5E\u4E8E\u5F53\u524D\u8BFE\u7A0B\u7684\u77E5\u8BC6\u70B9\u5173\u8054\u5230\u4F1A\u8BDD\uFF08\u4E0D\u521B\u5EFA\u65B0\u77E5\u8BC6\u70B9\uFF09\u3002\u76EE\u6807\u5B66\u4E60\u4E2D\u8BFE\u7A0B\u7ED3\u6784\u7531\u7528\u6237\u786E\u8BA4\uFF1B\u65E0\u9650\u5B66\u4E60\u4E0D\u8981\u8C03\u7528\u3002",
    parameters: obj(
      {
        topic: { type: "string", description: "\u672C\u6B21\u8BB2\u89E3\u7684\u4E3B\u9898\uFF08\u4EC5\u4F5C\u8BF4\u660E\uFF09" },
        topicDescription: { type: "string", description: "\u4E3B\u9898\u7684\u4E00\u53E5\u8BDD\u8BF4\u660E\uFF08\u53EF\u9009\uFF09" },
        concepts: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: obj(
            {
              name: { type: "string", description: "\u77E5\u8BC6\u70B9\u540D\u79F0\uFF0C\u5FC5\u987B\u662F\u5F53\u524D\u8BFE\u7A0B\u5DF2\u6709\u77E5\u8BC6\u70B9" },
              definition: { type: "string", description: "\u4E00\u53E5\u8BDD\u5B9A\u4E49\uFF08\u53EF\u9009\uFF09" },
              prerequisites: {
                type: "array",
                items: { type: "string" },
                description: "\u524D\u7F6E\u77E5\u8BC6\u70B9\u540D\u79F0\uFF08\u53EF\u9009\uFF0C\u9700\u662F\u5F53\u524D\u8BFE\u7A0B\u5DF2\u6709\u77E5\u8BC6\u70B9\uFF09"
              }
            },
            ["name"]
          )
        }
      },
      ["topic", "concepts"]
    )
  },
  {
    name: "present_exercise",
    description: "\u7ED9\u5B66\u751F\u51FA\u4E00\u9053\u53EF\u4EA4\u4E92\u7EC3\u4E60\u3002\u7B54\u6848\u53EA\u63D0\u4EA4\u7ED9\u7CFB\u7EDF\u3001\u4E0D\u80FD\u5199\u8FDB\u5BF9\u8BDD\u6587\u5B57\u91CC\u3002\u76EE\u6807\u5B66\u4E60\u4E2D concept \u5E94\u5BF9\u5E94\u672C\u8BFE\u7A0B\u5DF2\u6709\u77E5\u8BC6\u70B9\uFF1B\u65E0\u9650\u5B66\u4E60\u4E2D\u7684\u7EC3\u4E60\u53EA\u7528\u4E8E\u5F53\u4E0B\u7406\u89E3\uFF0C\u4E0D\u5199\u5165\u6B63\u5F0F\u6863\u6848\u3002",
    parameters: obj(
      {
        concept: {
          type: "string",
          description: "\u76EE\u6807\u5B66\u4E60\u4E2D\u8FD9\u9053\u9898\u8003\u67E5\u7684\u8BFE\u7A0B\u77E5\u8BC6\u70B9\u540D\u79F0\uFF08\u53EF\u9009\uFF1B\u65E0\u9650\u5B66\u4E60\u4E2D\u4F1A\u88AB\u5FFD\u7565\uFF09"
        },
        topic: { type: "string", description: "\u6240\u5C5E\u77E5\u8BC6\u4E3B\u9898\uFF08\u53EF\u9009\uFF09" },
        type: {
          type: "string",
          enum: ["single", "multi", "blank", "judge", "order", "numeric", "steps", "open"]
        },
        prompt: { type: "string", description: "\u9898\u5E72\uFF0C\u53EF\u7528 markdown \u4E0E $LaTeX$" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "\u9009\u62E9\u9898/\u6392\u5E8F\u9898\u7684\u9879\u76EE\u3002\u5355\u9009\u591A\u9009\u4E3A\u9009\u9879\uFF0C\u6392\u5E8F\u9898\u4E3A\u5F85\u6392\u5E8F\u9879"
        },
        steps: {
          type: "array",
          items: { type: "string" },
          description: "steps \u9898\u578B\u7684\u5404\u6B65\u9AA4\u8BF4\u660E"
        },
        blanks: { type: "integer", description: "\u586B\u7A7A\u9898\u7684\u7A7A\u6570\uFF08\u9ED8\u8BA4\u6309\u7B54\u6848\u6570\u91CF\uFF09" },
        unit: { type: "string", description: "\u8BA1\u7B97\u9898\u5355\u4F4D\uFF08\u53EF\u9009\uFF09" },
        answer: {
          type: "string",
          description: "\u6807\u51C6\u7B54\u6848\uFF08\u53EA\u7ED9\u7CFB\u7EDF\uFF09\u3002single \u5199\u9009\u9879\u4E0B\u6807\u5982 0\uFF1Bmulti \u5199 0,2\uFF1Bblank \u6BCF\u4E2A\u7A7A\u7528 | \u5206\u9694\u591A\u4E2A\u53EF\u63A5\u53D7\u7B54\u6848\u3001\u7A7A\u4E4B\u95F4\u7528 || \u5206\u9694\uFF0C\u5982 3|\u4E09||-2\uFF1Bjudge \u5199 true/false\uFF1Border \u5199\u6B63\u786E\u987A\u5E8F\u7684\u4E0B\u6807\u5982 2,0,1\uFF1Bnumeric \u5199\u6570\u5B57\u5982 3.14\uFF1Bsteps \u6BCF\u6B65\u7528 || \u5206\u9694\uFF1Bopen \u5199\u53C2\u8003\u7B54\u6848\u8981\u70B9"
        },
        accept: {
          type: "array",
          items: { type: "string" },
          description: "\u989D\u5916\u53EF\u63A5\u53D7\u7684\u7B49\u4EF7\u5199\u6CD5\uFF08\u53EF\u9009\uFF09\u3002blank/steps \u4E0E answer \u540C\u7ED3\u6784\uFF08\u7A7A\u4E4B\u95F4 ||\uFF0C\u540C\u4E00\u7A7A\u7684\u5199\u6CD5\u7528 |\uFF09\uFF1Bnumeric \u5199\u7B49\u4EF7\u6570\u503C"
        },
        tolerance: { type: "number", description: "\u8BA1\u7B97\u9898\u5141\u8BB8\u8BEF\u5DEE\uFF08\u53EF\u9009\uFF0C\u9ED8\u8BA4 1%\uFF09" },
        hint: { type: "string", description: "\u6E10\u8FDB\u63D0\u793A\uFF0C\u4E0D\u80FD\u76F4\u63A5\u7ED9\u7B54\u6848" },
        explanation: { type: "string", description: "\u63D0\u4EA4\u540E\u5C55\u793A\u7684\u89E3\u6790" },
        difficulty: { type: "integer", minimum: 1, maximum: 5, description: "\u96BE\u5EA6 1-5" },
        rubric: {
          type: "array",
          items: { type: "string" },
          description: "open \u9898\u578B\u7684\u8BC4\u5206\u7EF4\u5EA6"
        }
      },
      ["type", "prompt", "answer"]
    )
  },
  {
    name: "present_quiz",
    description: "\u4E00\u6B21\u51FA 2-5 \u9053\u5C0F\u6D4B\uFF0C\u9002\u5408\u9636\u6BB5\u9A8C\u6536\uFF1B\u53EF\u4EE5\u8986\u76D6\u591A\u4E2A\u76F8\u5173\u77E5\u8BC6\u70B9\uFF08\u6BCF\u9898\u53EF\u5E26\u81EA\u5DF1\u7684 concept/topic\uFF09\u3002\u6BCF\u9053\u9898\u5FC5\u987B\u662F\u786E\u5B9A\u6027\u9898\u578B\uFF08single/multi/blank/judge/order/numeric/steps\uFF09\uFF0C\u4E0D\u8981\u7528 open\uFF1B\u7B54\u6848\u53EA\u7ED9\u7CFB\u7EDF\uFF0C\u4E0D\u80FD\u5199\u8FDB\u9898\u5E72\u6216\u6B63\u6587\u3002",
    parameters: obj(
      {
        title: { type: "string", description: "\u5C0F\u6D4B\u6807\u9898" },
        concept: { type: "string", description: "\u6574\u5957\u9898\u7684\u9ED8\u8BA4\u77E5\u8BC6\u70B9\uFF08\u53EF\u9009\uFF1B\u5355\u9898 concept \u53EF\u8986\u76D6\uFF09" },
        topic: { type: "string", description: "\u6574\u5957\u9898\u7684\u9ED8\u8BA4\u4E3B\u9898\uFF08\u53EF\u9009\uFF09" },
        questions: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          items: obj(
            {
              concept: { type: "string", description: "\u672C\u9898\u77E5\u8BC6\u70B9\uFF08\u53EF\u9009\uFF1B\u8986\u76D6\u6574\u5957\u9ED8\u8BA4\uFF09" },
              topic: { type: "string", description: "\u672C\u9898\u4E3B\u9898\uFF08\u53EF\u9009\uFF09" },
              type: {
                type: "string",
                enum: ["single", "multi", "blank", "judge", "order", "numeric", "steps"]
              },
              prompt: { type: "string", description: "\u9898\u5E72\uFF0C\u53EF\u7528 markdown \u4E0E $LaTeX$" },
              options: { type: "array", items: { type: "string" } },
              steps: { type: "array", items: { type: "string" } },
              blanks: { type: "integer" },
              unit: { type: "string" },
              answer: {
                type: "string",
                description: "\u6807\u51C6\u7B54\u6848\uFF08\u53EA\u7ED9\u7CFB\u7EDF\uFF09\u3002single \u5199\u4E0B\u6807\uFF1Bmulti \u5199 0,2\uFF1Bblank \u6BCF\u7A7A\u7528 | \u5206\u9694\u3001\u7A7A\u4E4B\u95F4\u7528 ||\uFF1Bjudge \u5199 true/false\uFF1Border \u5199\u987A\u5E8F\u4E0B\u6807\uFF1Bnumeric \u5199\u6570\u5B57\uFF1Bsteps \u6BCF\u6B65\u7528 || \u5206\u9694"
              },
              accept: { type: "array", items: { type: "string" } },
              tolerance: { type: "number" },
              hint: { type: "string" },
              explanation: { type: "string" },
              difficulty: { type: "integer", minimum: 1, maximum: 5 }
            },
            ["type", "prompt", "answer"]
          )
        }
      },
      ["title", "questions"]
    )
  },
  {
    name: "present_chart",
    description: "\u7528\u771F\u5B9E\u6570\u636E\u753B\u56FE\uFF08\u6298\u7EBF/\u67F1\u72B6/\u6563\u70B9\uFF09\u3002\u6570\u636E\u5FC5\u987B\u6765\u81EA\u9898\u76EE\u6761\u4EF6\u6216\u53EF\u9760\u8BA1\u7B97\uFF0C\u4E0D\u5F97\u7F16\u9020\u3002\u9002\u5408\u5C55\u793A\u8D8B\u52BF\u3001\u51FD\u6570\u5F62\u72B6\u3001\u5BF9\u6BD4\u5173\u7CFB\u3002",
    parameters: obj(
      {
        title: { type: "string" },
        chartType: { type: "string", enum: ["line", "bar", "scatter"] },
        xLabel: { type: "string" },
        yLabel: { type: "string" },
        series: {
          type: "array",
          minItems: 1,
          items: obj(
            {
              name: { type: "string" },
              points: {
                type: "array",
                minItems: 1,
                items: obj({ x: { type: "number" }, y: { type: "number" } }, ["x", "y"])
              }
            },
            ["name", "points"]
          )
        },
        note: { type: "string", description: "\u4E00\u53E5\u8BDD\u89E3\u8BFB\uFF0C\u8BF4\u660E\u8BE5\u56FE\u7684\u7ED3\u8BBA" }
      },
      ["title", "series"]
    )
  },
  {
    name: "present_table",
    description: "\u7528\u8868\u683C\u505A\u6982\u5FF5\u5BF9\u6BD4\uFF08A vs B\u3001\u65B9\u6CD5\u5DEE\u5F02\u3001\u6761\u4EF6\u5BF9\u7167\uFF09\uFF0C\u6BD4\u957F\u6BB5\u843D\u66F4\u597D\u8BFB\u3002",
    parameters: obj(
      {
        title: { type: "string" },
        columns: { type: "array", minItems: 2, items: { type: "string" } },
        rows: {
          type: "array",
          minItems: 1,
          items: { type: "array", items: { type: "string" } }
        },
        note: { type: "string" }
      },
      ["title", "columns", "rows"]
    )
  },
  {
    name: "present_steps",
    description: "\u5C55\u793A\u89E3\u9898/\u64CD\u4F5C\u7684\u5206\u6B65\u9AA4\u6F14\u793A\uFF08\u771F\u5B9E\u6B65\u9AA4\uFF0C\u4E0D\u662F\u7A7A\u6CDB\u6807\u9898\uFF09\u3002\u9002\u5408\u7B97\u6CD5\u3001\u8BC1\u660E\u3001\u5B9E\u9A8C\u6D41\u7A0B\u3001\u8BB0\u8D26\u6D41\u7A0B\u3002",
    parameters: obj(
      {
        title: { type: "string" },
        steps: {
          type: "array",
          minItems: 2,
          maxItems: 10,
          items: obj({ title: { type: "string" }, detail: { type: "string" } }, ["title"])
        },
        note: { type: "string" }
      },
      ["title", "steps"]
    )
  },
  {
    name: "open_simulator",
    description: "\u521B\u5EFA\u4E00\u4E2A\u53EF\u8C03\u53C2\u6570\u7684\u4E92\u52A8\u6A21\u62DF\u5668\uFF08\u53C2\u6570\u6ED1\u5757 + \u5B9E\u65F6\u8BA1\u7B97\u7ED3\u679C + \u66F2\u7EBF\uFF09\u3002\u516C\u5F0F\u7528\u666E\u901A\u6570\u5B66\u8868\u8FBE\u5F0F\uFF0C\u53D8\u91CF\u540D\u5FC5\u987B\u4E0E\u53C2\u6570 key \u4E00\u81F4\uFF0C\u53EF\u7528 sin/cos/sqrt/ln/exp/abs/pow/min/max \u4E0E pi\u3001e\u3002\u7528\u4E8E\u8BA9\u5B66\u751F\u4EB2\u624B\u6539\u53C2\u6570\u89C2\u5BDF\u89C4\u5F8B\u3002",
    parameters: obj(
      {
        title: { type: "string" },
        description: { type: "string", description: "\u8FD9\u4E2A\u6A21\u62DF\u5668\u8BA9\u5B66\u751F\u89C2\u5BDF\u4EC0\u4E48" },
        params: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: obj(
            {
              key: { type: "string", description: "\u53D8\u91CF\u540D\uFF0C\u5982 a\u3001v0\u3001rate" },
              label: { type: "string", description: "\u4E2D\u6587\u6807\u7B7E\uFF0C\u5982\u300C\u521D\u901F\u5EA6\u300D" },
              min: { type: "number" },
              max: { type: "number" },
              step: { type: "number" },
              default: { type: "number" },
              unit: { type: "string" }
            },
            ["key", "label", "min", "max", "step", "default"]
          )
        },
        outputs: {
          type: "array",
          items: obj(
            {
              key: { type: "string" },
              label: { type: "string" },
              expression: { type: "string" },
              unit: { type: "string" },
              digits: { type: "integer" }
            },
            ["key", "label", "expression"]
          )
        },
        plot: obj(
          {
            xKey: { type: "string", description: "\u4F5C\u4E3A\u6A2A\u8F74\u7684\u53C2\u6570 key" },
            expression: { type: "string", description: "\u7EB5\u8F74\u8868\u8FBE\u5F0F" },
            xLabel: { type: "string" },
            yLabel: { type: "string" }
          },
          ["xKey", "expression"]
        ),
        insight: { type: "string", description: "\u5B66\u751F\u64CD\u4F5C\u540E\u5E94\u53D1\u73B0\u7684\u89C4\u5F8B\uFF08\u53EF\u7559\u7A7A\uFF0C\u7B49\u5B66\u751F\u81EA\u5DF1\u53D1\u73B0\uFF09" }
      },
      ["title", "params"]
    )
  },
  {
    name: "save_plan",
    description: "\u4EC5\u5728\u76EE\u6807\u5B66\u4E60\u3001\u4E14\u5B66\u751F\u660E\u786E\u8981\u6C42\u5236\u5B9A/\u8C03\u6574\u5B66\u4E60\u8BA1\u5212\u65F6\u8C03\u7528\u3002\u751F\u6210\u7684\u662F\u5F85\u786E\u8BA4\u7684\u8BA1\u5212\u8349\u7A3F\uFF1A\u8BA1\u5212 \u2192 \u8BFE\u7A0B\uFF08courses\uFF09\u2192 \u77E5\u8BC6\u70B9\uFF08concepts\uFF09\uFF0C\u4E0D\u4F1A\u76F4\u63A5\u5F00\u59CB\u6559\u5B66\uFF0C\u4E5F\u4E0D\u4F1A\u81EA\u52A8\u628A\u5F53\u524D\u4F1A\u8BDD\u7ED1\u5230\u8BA1\u5212\u3002",
    parameters: obj(
      {
        title: { type: "string", description: "\u5B66\u4E60\u8BA1\u5212\u540D\u79F0" },
        goal: { type: "string", description: "\u5B66\u4E60\u76EE\u6807\uFF08\u4E00\u53E5\u8BDD\uFF09" },
        courses: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: obj(
            {
              title: { type: "string", description: "\u8BFE\u7A0B/\u5B66\u4E60\u5355\u5143\u540D\u79F0" },
              description: { type: "string", description: "\u8FD9\u95E8\u8BFE\u5B66\u4EC0\u4E48\uFF08\u53EF\u9009\uFF09" },
              concepts: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                items: obj(
                  {
                    name: { type: "string", description: "\u77E5\u8BC6\u70B9\u540D\u79F0\uFF0C\u5177\u4F53\u800C\u53EF\u6559" },
                    definition: { type: "string", description: "\u4E00\u53E5\u8BDD\u5B9A\u4E49\uFF08\u53EF\u9009\uFF09" }
                  },
                  ["name"]
                )
              }
            },
            ["title", "concepts"]
          )
        }
      },
      ["title", "courses"]
    )
  },
  {
    name: "write_summary",
    description: "\u672C\u6B21\u5B66\u4E60\u7ED3\u675F/\u9636\u6BB5\u603B\u7ED3\u65F6\u5199\u5B66\u4E60\u5C0F\u7ED3\u3002progress \u53EA\u80FD\u5199\u672C\u6B21\u771F\u5B9E\u53D1\u751F\u4E14\u6709\u8BC1\u636E\u7684\u5185\u5BB9\uFF0C\u4E0D\u8981\u7F16\u9020\u7EDF\u8BA1\u6570\u636E\u3002",
    parameters: obj(
      {
        headline: { type: "string" },
        covered: { type: "array", items: { type: "string" } },
        progress: { type: "array", items: { type: "string" } },
        needsWork: { type: "array", items: { type: "string" } },
        nextSteps: { type: "array", items: { type: "string" } },
        resumeHint: { type: "string" }
      },
      ["headline"]
    )
  }
];

// scripts/audit/repro.ts
var OUT = import_node_path.default.resolve("docs/audit");
import_node_fs.default.mkdirSync(OUT, { recursive: true });
function loadConfig() {
  const db = new import_better_sqlite32.default(import_node_path.default.resolve("data/lumina.db"), { readonly: true });
  try {
    const row = db.prepare("select value from settings where key = 'ai_config'").get();
    if (!row) throw new Error("settings \u91CC\u6CA1\u6709 ai_config\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u9875\u914D\u7F6E\u6A21\u578B");
    const j = JSON.parse(row.value);
    return {
      id: null,
      label: j.model,
      provider: j.provider,
      baseUrl: j.baseUrl.replace(/\/+$/, ""),
      apiKey: j.apiKey,
      model: j.model,
      temperature: j.temperature,
      timeoutMs: 12e4,
      maxTokens: 4e3,
      source: "settings"
    };
  } finally {
    db.close();
  }
}
var config = loadConfig();
var tools = TEACHING_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters
}));
var CHART_CASES = [
  "\u5E2E\u6211\u753B\u4E00\u5F20\u67D0\u516C\u53F8 2022\u20132024 \u5E74\u8425\u4E1A\u6536\u5165\u548C\u51C0\u5229\u6DA6\u7684\u5BF9\u6BD4\u56FE\uFF0C\u793A\u610F\u6570\u636E\u5373\u53EF\u3002",
  "\u7528\u997C\u56FE\u5C55\u793A\u67D0\u516C\u53F8\u8D44\u4EA7\u7ED3\u6784\uFF1A\u6D41\u52A8\u8D44\u4EA7 60%\u3001\u56FA\u5B9A\u8D44\u4EA7 30%\u3001\u65E0\u5F62\u8D44\u4EA7 10%\u3002",
  "\u753B\u4E00\u5F20 2024 \u5E74 1\u201312 \u6708\u5E94\u6536\u8D26\u6B3E\u4F59\u989D\u7684\u8D8B\u52BF\u56FE\uFF0C\u793A\u610F\u6570\u636E\u5373\u53EF\u3002",
  "\u7528\u7011\u5E03\u56FE\u5C55\u793A\u4ECE\u8425\u4E1A\u6536\u5165\u5230\u51C0\u5229\u6DA6\u7684\u6784\u6210\uFF1A\u8425\u6536 1000\uFF0C\u6210\u672C 600\uFF0C\u8D39\u7528 200\uFF0C\u7A0E 50\u3002",
  "\u753B\u4E00\u4E2A\u590D\u5229\u589E\u957F\u66F2\u7EBF\uFF1A\u672C\u91D1 10000\uFF0C\u5E74\u5229\u7387 5%\uFF0C\u671F\u9650 20 \u5E74\u3002",
  "\u7528\u53CC\u8F74\u56FE\u5BF9\u6BD4\u67D0\u516C\u53F8\u4E09\u5E74\u6BDB\u5229\u7387\uFF08%\uFF09\u548C\u8425\u4E1A\u6536\u5165\uFF08\u4E07\u5143\uFF09\u3002",
  "\u753B\u672C\u91CF\u5229\u5206\u6790\u56FE\uFF1A\u56FA\u5B9A\u6210\u672C 50000\uFF0C\u5355\u4F4D\u552E\u4EF7 20\uFF0C\u5355\u4F4D\u53D8\u52A8\u6210\u672C 12\uFF0C\u9500\u91CF 0\u201310000\u3002",
  "\u7528\u67F1\u72B6\u56FE\u5BF9\u6BD4 A\u3001B \u4E24\u4E2A\u65B9\u6848\u7684 NPV \u548C IRR\u3002\u5047\u8BBE A \u65B9\u6848 NPV 120 \u4E07\u3001IRR 18%\uFF1BB \u65B9\u6848 NPV 90 \u4E07\u3001IRR 24%\u3002",
  "\u753B\u4E00\u5F20 5 \u5929\u7684 K \u7EBF\u56FE\u793A\u4F8B\uFF0C\u5C55\u793A\u5F00\u76D8\u3001\u6700\u9AD8\u3001\u6700\u4F4E\u3001\u6536\u76D8\u3002",
  "\u628A\u8FD9\u5F20\u8BD5\u7B97\u5E73\u8861\u8868\u753B\u6210\u56FE\uFF1A\u5E93\u5B58\u73B0\u91D1 50000\uFF0C\u94F6\u884C\u5B58\u6B3E 200000\uFF0C\u5E94\u4ED8\u8D26\u6B3E 80000\uFF0C\u5B9E\u6536\u8D44\u672C 170000\u3002"
];
var EXPLAIN_CASES = [
  "\u7528\u901A\u4FD7\u7684\u8BDD\u8BB2\u8BB2\u501F\u8D37\u8BB0\u8D26\u6CD5\uFF0C\u6211\u662F\u96F6\u57FA\u7840\u3002",
  "\u6211\u8FD8\u662F\u6CA1\u61C2\u6743\u8D23\u53D1\u751F\u5236\u548C\u6536\u4ED8\u5B9E\u73B0\u5236\u7684\u533A\u522B\uFF0C\u6362\u4E2A\u8BB2\u6CD5\u3002",
  "\u6211\u4E0A\u6B21\u628A\u300C\u5E94\u6536\u8D26\u6B3E\u300D\u548C\u300C\u9884\u6536\u8D26\u6B3E\u300D\u641E\u6DF7\u4E86\uFF0C\u5E2E\u6211\u7406\u6E05\u3002",
  "\u4EE5\u540E\u8BB2\u89E3\u90FD\u5148\u7528\u82CF\u683C\u62C9\u5E95\u5F0F\u63D0\u95EE\u5F15\u5BFC\u6211\uFF0C\u4E0D\u8981\u76F4\u63A5\u7ED9\u7B54\u6848\u3002\u73B0\u5728\u8BB2\u8BB2\u4EC0\u4E48\u662F\u8D44\u4EA7\u3002"
];
async function run(userText) {
  let streamed = "";
  const res = await streamChat({
    config,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText }
    ],
    tools,
    onText: (d) => {
      streamed += d;
    }
  });
  return {
    text: res.text || streamed,
    usage: res.usage,
    finishReason: res.finishReason,
    toolCalls: res.toolCalls
  };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function analyzeChart(call) {
  let args;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    return { verdict: "bad-json", errors: ["arguments \u4E0D\u662F\u5408\u6CD5 JSON"] };
  }
  const a = args;
  const xKinds = [
    ...new Set((a.series ?? []).flatMap((s) => (s.points ?? []).map((p) => typeof p.x)))
  ];
  const parsed = chartInputSchema.safeParse(args);
  if (parsed.success) {
    return {
      verdict: "ok",
      chartType: parsed.data.chartType,
      seriesCount: parsed.data.series.length,
      pointCount: parsed.data.series.reduce((n, s) => n + s.points.length, 0),
      xKinds
    };
  }
  return {
    verdict: "schema-fail",
    chartType: a.chartType ?? "(missing)",
    xKinds,
    errors: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`)
  };
}
function summarizeText(t) {
  const headings = (t.match(/^#{1,4}\s+/gm) ?? []).length;
  const analogies = (t.match(/比如|好比|想象|就像|相当于|打个比方/g) ?? []).length;
  const questions = (t.match(/[？?]/g) ?? []).length;
  const tables = (t.match(/^\|/gm) ?? []).length;
  return { chars: t.length, headings, analogies, questions, tableLines: tables };
}
async function main() {
  const report = {
    ranAt: (/* @__PURE__ */ new Date()).toISOString(),
    model: config.label,
    provider: config.provider,
    temperature: config.temperature,
    charts: [],
    explain: []
  };
  for (const [i, prompt] of CHART_CASES.entries()) {
    process.stdout.write(`[chart ${i + 1}/${CHART_CASES.length}] ${prompt.slice(0, 24)}\u2026 `);
    try {
      const r = await run(prompt);
      const chartCalls = r.toolCalls.filter((c) => c.name === "present_chart");
      const otherTools = r.toolCalls.filter((c) => c.name !== "present_chart").map((c) => c.name);
      const entry = {
        prompt,
        calledPresentChart: chartCalls.length > 0,
        chartCalls: chartCalls.map(analyzeChart),
        otherTools,
        textChars: r.text.length,
        usage: r.usage,
        preview: r.text.slice(0, 240)
      };
      report.charts.push(entry);
      const verdict = chartCalls.length ? chartCalls.map((c) => analyzeChart(c).verdict).join(",") : "no-tool";
      console.log(`\u2192 ${verdict}${otherTools.length ? ` (\u5176\u4ED6\u5DE5\u5177: ${otherTools.join(",")})` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.charts.push({ prompt, error: msg });
      console.log(`\u2192 ERROR ${msg}`);
    }
    await sleep(600);
  }
  for (const [i, prompt] of EXPLAIN_CASES.entries()) {
    process.stdout.write(`[explain ${i + 1}/${EXPLAIN_CASES.length}] ${prompt.slice(0, 22)}\u2026 `);
    try {
      const r = await run(prompt);
      const entry = {
        prompt,
        tools: r.toolCalls.map((c) => c.name),
        usage: r.usage,
        metrics: summarizeText(r.text),
        text: r.text
      };
      report.explain.push(entry);
      console.log(`\u2192 ${entry.metrics.chars} \u5B57, ${entry.metrics.headings} \u6807\u9898, ${entry.metrics.analogies} \u7C7B\u6BD4`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.explain.push({ prompt, error: msg });
      console.log(`\u2192 ERROR ${msg}`);
    }
    await sleep(600);
  }
  const file = import_node_path.default.join(OUT, "repro-2026-10-24.json");
  import_node_fs.default.writeFileSync(file, JSON.stringify(report, null, 2), "utf8");
  console.log(`
Saved: ${file}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
