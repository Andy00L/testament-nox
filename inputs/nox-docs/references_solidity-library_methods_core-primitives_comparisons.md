---
url: /references/solidity-library/methods/core-primitives/comparisons.md
description: Compare two encrypted values and return an encrypted boolean
---

# Comparisons

Compare two encrypted values and return an encrypted boolean. Both operands must
be of the same type. The result is always an `ebool`, regardless of the operand
type. Comparison semantics depend on the type: unsigned for `euintN`, signed for
`eintN`.

Comparison results are typically used with
[select](/references/solidity-library/methods/core-primitives/select) for
encrypted conditional logic.

**Supported types:** `euint16`, `euint256`, `eint16`, `eint256`

### Usage

```solidity
// Check if balance is sufficient and conditionally apply a transfer
ebool hasEnough = Nox.ge(balance, amount);
euint256 newBalance = Nox.select(hasEnough, Nox.sub(balance, amount), balance);
Nox.allowThis(newBalance);
```

## eq

```solidity
function eq(euint256 a, euint256 b) internal returns (ebool)
```

Returns encrypted `true` when `a == b`.

| Example (Uint8) | Result  | Reason           |
| --------------- | ------- | ---------------- |
| `Eq(42, 42)`    | `true`  | Equal values     |
| `Eq(0, 255)`    | `false` | Different values |

## ne

```solidity
function ne(euint256 a, euint256 b) internal returns (ebool)
```

Returns encrypted `true` when `a != b`.

| Example (Uint8) | Result  | Reason           |
| --------------- | ------- | ---------------- |
| `Ne(42, 42)`    | `false` | Equal values     |
| `Ne(0, 255)`    | `true`  | Different values |

## lt

```solidity
function lt(euint256 a, euint256 b) internal returns (ebool)
```

Returns encrypted `true` when `a < b`.

| Example (Uint8) | Result  | Reason              |
| --------------- | ------- | ------------------- |
| `Lt(10, 200)`   | `true`  | 10 < 200 (unsigned) |
| `Lt(200, 10)`   | `false` | 200 < 10 is false   |

| Example (Int8)  | Result  | Reason              |
| --------------- | ------- | ------------------- |
| `Lt(-56, 10)`   | `true`  | -56 < 10 (signed)   |
| `Lt(127, -128)` | `false` | 127 < -128 is false |

## le

```solidity
function le(euint256 a, euint256 b) internal returns (ebool)
```

Returns encrypted `true` when `a <= b`.

| Example (Uint8) | Result  | Reason             |
| --------------- | ------- | ------------------ |
| `Le(10, 10)`    | `true`  | Equal values       |
| `Le(200, 10)`   | `false` | 200 <= 10 is false |

## gt

```solidity
function gt(euint256 a, euint256 b) internal returns (ebool)
```

Returns encrypted `true` when `a > b`.

| Example (Uint8) | Result  | Reason              |
| --------------- | ------- | ------------------- |
| `Gt(200, 10)`   | `true`  | 200 > 10 (unsigned) |
| `Gt(10, 200)`   | `false` | 10 > 200 is false   |

| Example (Int8)  | Result  | Reason              |
| --------------- | ------- | ------------------- |
| `Gt(10, -56)`   | `true`  | 10 > -56 (signed)   |
| `Gt(-128, 127)` | `false` | -128 > 127 is false |

## ge

```solidity
function ge(euint256 a, euint256 b) internal returns (ebool)
```

Returns encrypted `true` when `a >= b`.

| Example (Uint8) | Result  | Reason             |
| --------------- | ------- | ------------------ |
| `Ge(10, 10)`    | `true`  | Equal values       |
| `Ge(10, 200)`   | `false` | 10 >= 200 is false |
