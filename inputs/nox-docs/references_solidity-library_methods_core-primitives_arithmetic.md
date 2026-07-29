---
url: /references/solidity-library/methods/core-primitives/arithmetic.md
description: Encrypted arithmetic operations with wrapping semantics
---

# Arithmetic

Arithmetic operations on two encrypted values of the same type. All arithmetic
uses **wrapping semantics**, matching Solidity's `unchecked` behavior: on
overflow or underflow, values wrap around the type boundary instead of
reverting.

For overflow-safe variants, see
[Safe Arithmetic](/references/solidity-library/methods/core-primitives/safe-arithmetic).

**Supported types:** `euint16`, `euint256`, `eint16`, `eint256`

### Usage

```solidity
euint256 total = Nox.add(balance, deposit);
euint256 remaining = Nox.sub(total, fee);
euint256 reward = Nox.mul(remaining, rate);
euint256 share = Nox.div(reward, participantCount);
Nox.allowThis(share);
```

## add

```solidity
function add(euint256 a, euint256 b) internal returns (euint256)
```

Wrapping addition. On overflow, the result wraps around the type boundary.

* **Unsigned:** `(a + b) mod 2^N`
* **Signed:** `(a + b) mod 2^N`, interpreted in two's complement. For example on
  Int8, adding past `127` continues from `-128`

| Example (Uint8) | Result | Reason                  |
| --------------- | ------ | ----------------------- |
| `200 + 100`     | `44`   | Overflows, wraps around |
| `255 + 1`       | `0`    | Overflows to zero       |
| `100 + 50`      | `150`  | No overflow             |

| Example (Int8) | Result | Reason                       |
| -------------- | ------ | ---------------------------- |
| `100 + 100`    | `-56`  | Overflows, wraps to negative |
| `127 + 1`      | `-128` | Overflows to MIN             |
| `-50 + 30`     | `-20`  | No overflow                  |

## sub

```solidity
function sub(euint256 a, euint256 b) internal returns (euint256)
```

Wrapping subtraction. On underflow, the result wraps around the type boundary.

* **Unsigned:** when the result would be negative, it wraps around through MAX.
  For example on Uint8, `0 - 1` gives `255`
* **Signed:** when the result goes below MIN, it wraps around through MAX. For
  example on Int8, `-128 - 1` gives `127`

| Example (Uint8) | Result | Reason                   |
| --------------- | ------ | ------------------------ |
| `0 - 1`         | `255`  | Underflows, wraps to MAX |
| `10 - 200`      | `66`   | Underflows, wraps around |
| `100 - 30`      | `70`   | No underflow             |

| Example (Int8) | Result | Reason                        |
| -------------- | ------ | ----------------------------- |
| `-128 - 1`     | `127`  | Underflows, wraps to MAX      |
| `-100 - 100`   | `56`   | Underflows, wraps to positive |
| `50 - 30`      | `20`   | No underflow                  |

## mul

```solidity
function mul(euint256 a, euint256 b) internal returns (euint256)
```

Wrapping multiplication. On overflow, the result wraps around the type boundary.

* **Unsigned:** `(a * b) mod 2^N`
* **Signed:** `(a * b) mod 2^N`, interpreted in two's complement

| Example (Uint8) | Result | Reason                  |
| --------------- | ------ | ----------------------- |
| `3 * 100`       | `44`   | Overflows, wraps around |
| `16 * 16`       | `0`    | Overflows to zero       |
| `10 * 5`        | `50`   | No overflow             |

| Example (Int8) | Result | Reason                       |
| -------------- | ------ | ---------------------------- |
| `-1 * -128`    | `-128` | Overflows, wraps back to MIN |
| `10 * 20`      | `-56`  | Overflows, wraps to negative |
| `-5 * 3`       | `-15`  | No overflow                  |

## div

```solidity
function div(euint256 a, euint256 b) internal returns (euint256)
```

Integer division, truncated toward zero. Division by zero does not revert, it
returns the maximum representable value of the type (saturates toward
+infinity).

* **Unsigned:** returns `2^N - 1` (MAX\_U). For example on Uint8, `10 / 0` gives
  `255`
* **Signed:** returns `2^(N-1) - 1` (MAX\_I). For example on Int8, `10 / 0` gives
  `127`. Additionally, `MIN / -1` wraps back to `MIN` because the true result
  (`128`) exceeds MAX\_I (`127`)

| Example (Uint8) | Result | Reason                          |
| --------------- | ------ | ------------------------------- |
| `10 / 0`        | `255`  | Division by zero, returns MAX\_U |
| `7 / 2`         | `3`    | Truncated toward zero           |
| `1 / 2`         | `0`    | Truncated toward zero           |
| `0 / 5`         | `0`    | Zero numerator                  |

| Example (Int8) | Result | Reason                          |
| -------------- | ------ | ------------------------------- |
| `10 / 0`       | `127`  | Division by zero, returns MAX\_I |
| `-128 / -1`    | `-128` | Overflow, wraps back to MIN     |
| `7 / 2`        | `3`    | Truncated toward zero           |
| `-7 / 2`       | `-3`   | Truncated toward zero           |
