/**
 * 安全表达式求值器
 *
 * 用途：AI 生成的互动模拟器只提供"表达式字符串"，由本模块解析执行。
 * 绝不使用 eval / new Function —— 模型输出的任意代码不会被执行，
 * 只允许白名单内的运算符、函数与已声明变量。
 */

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "end" };

const FUNCS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  min: (...a: number[]) => Math.min(...a),
  max: (...a: number[]) => Math.max(...a),
  pow: (a: number, b: number) => Math.pow(a, b),
  mod: (a: number, b: number) => a % b,
  hypot: (...a: number[]) => Math.hypot(...a),
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, PI: Math.PI, E: Math.E };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      // 科学计数法 1e-3
      if (j < n && /[eE]/.test(src[j]) && /[0-9+-]/.test(src[j + 1] ?? "")) {
        j++;
        if (/[+-]/.test(src[j])) j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      const raw = src.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new Error(`非法数字: ${raw}`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^%(),".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    throw new Error(`不支持的字符: ${ch}`);
  }
  out.push({ t: "end" });
  return out;
}

export function evaluateExpression(src: string, vars: Record<string, number> = {}): number {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const expectOp = (v: string) => {
    const tk = next();
    if (tk.t !== "op" || tk.v !== v) throw new Error(`缺少 "${v}"`);
  };

  function parseExpr(): number {
    let left = parseTerm();
    while (peek().t === "op" && ["+", "-"].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseUnary();
    while (peek().t === "op" && ["*", "/", "%"].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const right = parseUnary();
      if (op === "*") left = left * right;
      else if (op === "/") left = left / right;
      else left = left % right;
    }
    return left;
  }

  function parseUnary(): number {
    const tk = peek();
    if (tk.t === "op" && (tk.v === "-" || tk.v === "+")) {
      next();
      const v = parseUnary();
      return tk.v === "-" ? -v : v;
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parseAtom();
    if (peek().t === "op" && (peek() as { v: string }).v === "^") {
      next();
      const exp = parseUnary(); // 右结合
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseAtom(): number {
    const tk = next();
    if (tk.t === "num") return tk.v;
    if (tk.t === "op" && tk.v === "(") {
      const v = parseExpr();
      expectOp(")");
      return v;
    }
    if (tk.t === "id") {
      const name = tk.v;
      if (peek().t === "op" && (peek() as { v: string }).v === "(") {
        next();
        const args: number[] = [];
        if (!(peek().t === "op" && (peek() as { v: string }).v === ")")) {
          args.push(parseExpr());
          while (peek().t === "op" && (peek() as { v: string }).v === ",") {
            next();
            args.push(parseExpr());
          }
        }
        expectOp(")");
        const fn = FUNCS[name];
        if (!fn) throw new Error(`未知函数: ${name}`);
        return fn(...args);
      }
      if (name in CONSTS) return CONSTS[name];
      if (name in vars && Number.isFinite(vars[name])) return vars[name];
      throw new Error(`未知变量: ${name}`);
    }
    throw new Error("表达式不完整");
  }

  const value = parseExpr();
  if (peek().t !== "end") throw new Error("表达式存在多余内容");
  if (!Number.isFinite(value)) throw new Error("计算结果不是有限数值");
  return value;
}

/** 校验表达式能否在给定参数下求值（用于组件生成时提前发现坏表达式） */
export function validateExpression(
  src: string,
  vars: Record<string, number>,
): { ok: boolean; error?: string } {
  try {
    evaluateExpression(src, vars);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
