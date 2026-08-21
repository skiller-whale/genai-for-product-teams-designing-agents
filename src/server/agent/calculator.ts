// A small, safe arithmetic evaluator: numbers, + - * /, parentheses, and a
// trailing % (percent-of is spelled out as multiplication, e.g. "0.75 * 84").
// No eval(), no variables, no function calls — nothing to inject.

class Parser {
  private pos = 0;

  constructor(private readonly input: string) {}

  parse(): number {
    const value = this.expression();
    this.skipWhitespace();
    if (this.pos < this.input.length) {
      throw new Error(`Unexpected character '${this.input[this.pos]}' at position ${this.pos + 1}`);
    }
    return value;
  }

  private expression(): number {
    let value = this.term();
    for (;;) {
      this.skipWhitespace();
      const op = this.input[this.pos];
      if (op === '+' || op === '-') {
        this.pos += 1;
        const rhs = this.term();
        value = op === '+' ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  private term(): number {
    let value = this.factor();
    for (;;) {
      this.skipWhitespace();
      const op = this.input[this.pos];
      if (op === '*' || op === '/') {
        this.pos += 1;
        const rhs = this.factor();
        if (op === '/' && rhs === 0) throw new Error('Division by zero');
        value = op === '*' ? value * rhs : value / rhs;
      } else {
        return value;
      }
    }
  }

  private factor(): number {
    this.skipWhitespace();
    const char = this.input[this.pos];
    if (char === '(') {
      this.pos += 1;
      const value = this.expression();
      this.skipWhitespace();
      if (this.input[this.pos] !== ')') throw new Error('Missing closing parenthesis');
      this.pos += 1;
      return this.percent(value);
    }
    if (char === '-') {
      this.pos += 1;
      return -this.factor();
    }
    return this.percent(this.number());
  }

  /** A trailing % divides by 100, so "75% * 84" works as people expect. */
  private percent(value: number): number {
    if (this.input[this.pos] === '%') {
      this.pos += 1;
      return value / 100;
    }
    return value;
  }

  private number(): number {
    this.skipWhitespace();
    // Tolerate a leading £ or $, since the model often passes prices verbatim.
    if (this.input[this.pos] === '£' || this.input[this.pos] === '$') this.pos += 1;
    // Allow thousands commas ("1,000") since the model often writes them.
    const match = /^\d+(,\d{3})*(\.\d+)?/.exec(this.input.slice(this.pos));
    if (!match) {
      throw new Error(`Expected a number at position ${this.pos + 1}`);
    }
    this.pos += match[0].length;
    return Number(match[0].replaceAll(',', ''));
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos += 1;
    }
  }
}

export function calculate(expression: string): number {
  if (typeof expression !== 'string' || expression.trim() === '') {
    throw new Error('Provide an arithmetic expression, e.g. "0.75 * 84"');
  }
  return new Parser(expression).parse();
}
