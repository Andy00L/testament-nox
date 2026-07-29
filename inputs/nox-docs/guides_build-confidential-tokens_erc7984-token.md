---
url: /guides/build-confidential-tokens/erc7984-token.md
description: Build a confidential fungible token with ERC-7984
---

# Create a Confidential ERC-7984 Token

This guide walks you through creating a confidential token using the `ERC7984`
base contract from `@iexec-nox/nox-confidential-contracts`. By the end you will
have a token with encrypted balances, private transfers, and owner-controlled
minting and burning.

## Prerequisites

* [Hardhat](/guides/build-confidential-smart-contracts/hardhat) or
  [Foundry](/guides/build-confidential-smart-contracts/foundry) project set up
  with Nox
* Solidity `^0.8.28`

## Installation

::: code-group

```sh [pnpm]
pnpm add @iexec-nox/nox-confidential-contracts
```

```sh [npm]
npm install @iexec-nox/nox-confidential-contracts
```

```sh [yarn]
yarn add @iexec-nox/nox-confidential-contracts
```

```sh [bun]
bun add @iexec-nox/nox-confidential-contracts
```

:::

This also installs `@iexec-nox/nox-protocol-contracts` and
`@openzeppelin/contracts` as dependencies.

## Deploying the contract

Start by inheriting from `ERC7984` and adding mint/burn functions restricted to
the owner:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {ERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/token/ERC7984.sol";

contract ConfidentialToken is ERC7984, Ownable {
    constructor()
        ERC7984("Confidential Token", "CTOK", "")
        Ownable(msg.sender)
    {}

    /// @notice Mint tokens to `to` with an encrypted amount
    function mint(
        address to,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner returns (euint256) {
        euint256 amount = Nox.fromExternal(encryptedAmount, inputProof);
        return _mint(to, amount);
    }

    /// @notice Burn tokens from `from` with an encrypted amount
    function burn(
        address from,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner returns (euint256) {
        euint256 amount = Nox.fromExternal(encryptedAmount, inputProof);
        return _burn(from, amount);
    }
}
```

That's it. The `ERC7984` base contract handles everything else: encrypted
balances, transfers, operators, callbacks, and access control on handles.

## Operators

ERC-7984 replaces ERC-20 allowances with time-bound operators. An operator can
transfer any amount on behalf of the holder until a given timestamp:

```solidity
// Grant operator access until a specific timestamp
token.setOperator(spenderAddress, uint48(block.timestamp + 1 hours));

// Operator calls transferFrom
token.confidentialTransferFrom(
    holderAddress,
    recipientAddress,
    encryptedAmount,
    inputProof
);
```

::: warning
Setting an operator grants full access to all tokens until the timestamp
expires. There is no amount limit. Only set operators you trust completely.
:::

To revoke an operator, set the timestamp to `0`:

```solidity
token.setOperator(spenderAddress, 0);
```

## Receiving tokens in a contract

Smart contracts that want to react to incoming ERC-7984 transfers should
implement the `IERC7984Receiver` interface:

```solidity
import {ebool, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC7984Receiver} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984Receiver.sol";

contract Vault is IERC7984Receiver {
    function onConfidentialTransferReceived(
        address operator,
        address from,
        euint256 amount,
        bytes calldata data
    ) external returns (ebool) {
        // Process the incoming transfer...
        // Return encrypted true to accept, false to refund
        ebool accepted = Nox.toEbool(true);
        Nox.allowTransient(accepted, msg.sender);
        return accepted;
    }
}
```

When a user calls `confidentialTransferAndCall`, the token contract transfers
first, then calls the hook on the recipient. If the hook returns encrypted
`false`, the transfer is automatically reversed.

## Swap ERC-7984 to ERC-7984

A common use case is swapping between two confidential tokens. Below is a
contract that swaps `fromToken` for `toToken` at a 1:1 rate. The caller must
have set this contract as an operator on `fromToken` beforehand.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";

contract ConfidentialSwap {
    function swap(
        IERC7984 fromToken,
        IERC7984 toToken,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof
    ) external {
        require(fromToken.isOperator(msg.sender, address(this)));

        euint256 amount = Nox.fromExternal(encryptedAmount, inputProof);

        // Transfer fromToken: caller → this contract
        Nox.allowTransient(amount, address(fromToken));
        euint256 received = fromToken.confidentialTransferFrom(
            msg.sender, address(this), amount
        );

        // Transfer toToken: this contract → caller
        Nox.allowTransient(received, address(toToken));
        toToken.confidentialTransfer(msg.sender, received);
    }
}
```

The steps are:

1. Check operator approval (the caller must have called
   `fromToken.setOperator(swapContract, until)`)
2. Allow `fromToken` to access the encrypted amount
3. Transfer `fromToken` from caller to the swap contract
4. Allow `toToken` to access the actually transferred amount
5. Transfer `toToken` from the swap contract back to the caller

The swap amount remains encrypted throughout, nobody watching the blockchain can
see how much was swapped.

## Customizing behavior

The `_update` function is the single entry point for all balance changes (mint,
burn, transfer). Override it to add custom logic:

```solidity
function _update(
    address from,
    address to,
    euint256 amount
) internal override returns (euint256 transferred) {
    // Custom logic before update...

    transferred = super._update(from, to, amount);

    // Custom logic after update...
}
```

## Next steps

* [ERC-20 to ERC-7984](/guides/build-confidential-tokens/erc20-to-erc7984-wrapper):
  wrap existing ERC-20 tokens
* [Solidity Library](/references/solidity-library/getting-started): all Nox
  operations
* [JS SDK](/references/js-sdk): encrypt inputs and decrypt balances from
  JavaScript
