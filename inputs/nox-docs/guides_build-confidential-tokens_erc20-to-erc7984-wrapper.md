---
url: /guides/build-confidential-tokens/erc20-to-erc7984-wrapper.md
description: Wrap existing ERC-20 tokens into confidential ERC-7984 tokens
---

# Wrap ERC-20 into Confidential ERC-7984

An ERC-7984 wrapper lets users convert any existing ERC-20 token into a
confidential ERC-7984 token and back. The underlying ERC-20 tokens are held by
the wrapper contract, while confidential tokens with encrypted balances are
minted 1:1.

## How it works

```mermaid
sequenceDiagram
    participant User
    participant Wrapper as ERC20ToERC7984Wrapper
    participant ERC20 as ERC-20 Token

    Note over User,ERC20: Wrap (ERC-20 → ERC-7984)
    User->>ERC20: approve(wrapper, amount)
    User->>Wrapper: wrap(to, amount)
    Wrapper->>ERC20: transferFrom(user, wrapper, amount)
    Wrapper->>Wrapper: _mint(to, amount)
    Wrapper-->>User: confidential balance updated

    Note over User,ERC20: Unwrap (ERC-7984 → ERC-20)
    User->>Wrapper: unwrap(from, to, encryptedAmount, proof)
    Wrapper->>Wrapper: _burn(from, encryptedAmount)
    Note over Wrapper: Decrypt burnt amount off-chain
    User->>Wrapper: finalizeUnwrap(unwrapRequestId, decryptedAmountAndProof)
    Wrapper->>ERC20: transfer(to, cleartext)
    Wrapper-->>User: ERC-20 tokens received
```

## Key concepts

### One-step wrap

Wrapping is straightforward: the ERC-20 amount is public, so the wrapper can
transfer and mint in a single transaction. The user approves the wrapper, calls
`wrap()`, and their confidential balance is updated immediately.

### Two-step unwrap

Unwrapping is more complex because the burn amount is encrypted. The wrapper
cannot transfer ERC-20 tokens without knowing the plaintext amount. This
requires two steps:

1. **Request unwrap**: the user calls `unwrap()`, which burns the encrypted
   ERC-7984 tokens
2. **Finalize unwrap**: after the burnt amount is decrypted off-chain (via the
   Nox protocol), the user calls `finalizeUnwrap()` with the decrypted value and
   a decryption proof. The wrapper then transfers the corresponding ERC-20
   tokens.

## Deploying a wrapper

To deploy a wrapper, you only need the address of the ERC-20 token you want to
wrap:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract WrappedUSDC is ERC20ToERC7984Wrapper {
    constructor(IERC20 usdc)
        ERC20ToERC7984Wrapper(usdc)
        ERC7984("Wrapped Confidential USDC", "wcUSDC", "")
    {}
}
```

The wrapper inherits from both `ERC7984` and `ERC20ToERC7984Wrapper`. All
ERC-7984 features (confidential transfers, operators, callbacks) work on the
wrapped token.

## Swap ERC-20 to ERC-7984

Swapping from a plaintext ERC-20 to a confidential ERC-7984 is done via the
`wrap` function. It transfers ERC-20 tokens from the caller to the wrapper, then
mints the equivalent confidential tokens:

```solidity
function wrap(address to, uint256 amount) public virtual returns (euint256) {
    SafeERC20.safeTransferFrom(IERC20(underlying()), msg.sender, address(this), amount);
    euint256 wrappedAmount = _mint(to, Nox.toEuint256(amount));
    Nox.allowTransient(wrappedAmount, msg.sender);
    return wrappedAmount;
}
```

From the caller's perspective:

```solidity
// 1. Approve the wrapper
usdc.approve(address(wrappedUSDC), 100e18);

// 2. Wrap into confidential tokens
wrappedUSDC.wrap(msg.sender, 100e18);

// Balance is now encrypted, nobody can see how much you hold
```

The ERC-20 transfer would revert on failure (insufficient balance, missing
approval). The `_mint` is guaranteed to succeed since it only adds to balances.

## Swap ERC-7984 to ERC-20

Swapping from a confidential token back to a plaintext ERC-20 is more complex.
The wrapper needs to know the plaintext amount to transfer ERC-20 tokens, but
the burn amount is encrypted. This requires two steps:

### Step 1: Request unwrap

The user burns their confidential tokens. The burnt amount is recorded as an
encrypted handle, and the function returns an `unwrapRequestId` needed for
finalization:

```solidity
// Encrypt the amount to unwrap
// (off-chain via JS SDK, then call the contract)
euint256 unwrapRequestId = wrappedUSDC.unwrap(
    msg.sender,      // burn from
    msg.sender,      // send ERC-20 to
    encryptedAmount,
    inputProof
);
```

### Step 2: Finalize with decryption proof

After the Nox protocol decrypts the burnt amount off-chain, the user calls
`finalizeUnwrap` with the `unwrapRequestId` and the decrypted amount bundled
with its proof:

```solidity
wrappedUSDC.finalizeUnwrap(
    unwrapRequestId,
    decryptedAmountAndProof
);
// ERC-20 tokens are transferred to the recipient
```

The wrapper verifies the decryption proof, then transfers the plaintext amount
of the underlying ERC-20 to the recipient.

## Next steps

* [ERC-7984 Token](/guides/build-confidential-tokens/erc7984-token): create a
  native confidential token from scratch
* [Demo](/guides/build-confidential-tokens/demo): confidential token swap
  application
* [JS SDK](/references/js-sdk): encrypt inputs and decrypt balances from
  JavaScript
