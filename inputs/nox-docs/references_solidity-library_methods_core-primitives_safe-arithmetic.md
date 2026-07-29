---
url: /references/solidity-library/methods/core-primitives/safe-arithmetic.md
description: Encrypted arithmetic with overflow and underflow detection
---

# Safe Arithmetic

Same operations as
[core arithmetic](/references/solidity-library/methods/core-primitives/arithmetic),
but returning two handles: `(ebool success, result)`. When `success` is `false`,
the `result` is always `0`.

Use safe arithmetic when your contract needs to detect and handle overflow or
underflow without leaking information through transaction reverts.

**Supported types:** `euint16`, `euint256`, `eint16`, `eint256`

### Usage

```solidity
(ebool ok, euint256 newBalance) = Nox.safeAdd(balance, amount);
// Use select to keep the old balance on failure
euint256 finalBalance = Nox.select(ok, newBalance, balance);
Nox.allowThis(finalBalance);
```

## safeAdd

```solidity
function safeAdd(euint256 a, euint256 b) internal returns (ebool success, euint256 result)
```

Addition with overflow detection. Returns `success = false` and `result = 0` on
overflow.

* **Unsigned:** `success = false` when `a + b > MAX`
* **Signed:** `success = false` when the result exceeds MAX or goes below MIN

| Example (Uint8)     | success | result | Reason      |
| ------------------- | ------- | ------ | ----------- |
| `SafeAdd(200, 100)` | `false` | `0`    | Overflow    |
| `SafeAdd(255, 1)`   | `false` | `0`    | Overflow    |
| `SafeAdd(200, 55)`  | `true`  | `255`  | No overflow |
| `SafeAdd(100, 50)`  | `true`  | `150`  | No overflow |
| `SafeAdd(0, 0)`     | `true`  | `0`    | No overflow |

| Example (Int8)      | success | result | Reason            |
| ------------------- | ------- | ------ | ----------------- |
| `SafeAdd(127, 1)`   | `false` | `0`    | Positive overflow |
| `SafeAdd(-128, -1)` | `false` | `0`    | Negative overflow |
| `SafeAdd(100, 20)`  | `true`  | `120`  | No overflow       |
| `SafeAdd(-50, -50)` | `true`  | `-100` | No overflow       |

## safeSub

```solidity
function safeSub(euint256 a, euint256 b) internal returns (ebool success, euint256 result)
```

Subtraction with underflow detection. Returns `success = false` and `result = 0`
on underflow.

* **Unsigned:** `success = false` when `a - b < 0`
* **Signed:** `success = false` when the result exceeds MAX or goes below MIN

| Example (Uint8)    | success | result | Reason       |
| ------------------ | ------- | ------ | ------------ |
| `SafeSub(0, 1)`    | `false` | `0`    | Underflow    |
| `SafeSub(50, 100)` | `false` | `0`    | Underflow    |
| `SafeSub(100, 50)` | `true`  | `50`   | No underflow |
| `SafeSub(0, 0)`    | `true`  | `0`    | No underflow |

| Example (Int8)     | success | result | Reason                          |
| ------------------ | ------- | ------ | ------------------------------- |
| `SafeSub(-128, 1)` | `false` | `0`    | Signed underflow                |
| `SafeSub(127, -1)` | `false` | `0`    | Equivalent to 127 + 1, overflow |
| `SafeSub(0, 0)`    | `true`  | `0`    | No underflow                    |

## safeMul

```solidity
function safeMul(euint256 a, euint256 b) internal returns (ebool success, euint256 result)
```

Multiplication with overflow detection. Returns `success = false` and
`result = 0` on overflow.

* **Unsigned:** `success = false` when `a * b > MAX`
* **Signed:** `success = false` when the result exceeds MAX or goes below MIN

| Example (Uint8)   | success | result | Reason                |
| ----------------- | ------- | ------ | --------------------- |
| `SafeMul(16, 16)` | `false` | `0`    | Overflow              |
| `SafeMul(15, 17)` | `false` | `0`    | Overflow              |
| `SafeMul(15, 16)` | `true`  | `240`  | No overflow           |
| `SafeMul(0, x)`   | `true`  | `0`    | Zero is absorbing     |
| `SafeMul(1, x)`   | `true`  | `x`    | Identity, no overflow |

| Example (Int8)      | success | result | Reason               |
| ------------------- | ------- | ------ | -------------------- |
| `SafeMul(-128, -1)` | `false` | `0`    | Overflow (128 > MAX) |
| `SafeMul(127, 2)`   | `false` | `0`    | Overflow             |
| `SafeMul(64, 2)`    | `false` | `0`    | Overflow (128 > MAX) |
| `SafeMul(-1, -1)`   | `true`  | `1`    | No overflow          |
| `SafeMul(63, 2)`    | `true`  | `126`  | No overflow          |

## safeDiv

```solidity
function safeDiv(euint256 a, euint256 b) internal returns (ebool success, euint256 result)
```

Division with error detection. Returns `success = false` and `result = 0` on
division by zero or signed overflow (`MIN / -1`).

* **Unsigned:** `success = false` when dividing by zero
* **Signed:** `success = false` when dividing by zero or `MIN / -1`

| Example (Uint8)   | success | result | Reason                |
| ----------------- | ------- | ------ | --------------------- |
| `SafeDiv(255, 0)` | `false` | `0`    | Division by zero      |
| `SafeDiv(0, 0)`   | `false` | `0`    | Division by zero      |
| `SafeDiv(100, 3)` | `true`  | `33`   | Normal division       |
| `SafeDiv(1, 2)`   | `true`  | `0`    | Truncated toward zero |
| `SafeDiv(0, 5)`   | `true`  | `0`    | Zero numerator        |

| Example (Int8)      | success | result | Reason                            |
| ------------------- | ------- | ------ | --------------------------------- |
| `SafeDiv(100, 0)`   | `false` | `0`    | Division by zero                  |
| `SafeDiv(0, 0)`     | `false` | `0`    | Division by zero                  |
| `SafeDiv(-128, -1)` | `false` | `0`    | Signed overflow (MIN / -1)        |
| `SafeDiv(-7, 2)`    | `true`  | `-3`   | Truncated toward zero (not floor) |
| `SafeDiv(50, 5)`    | `true`  | `10`   | Normal division                   |
