---
url: /getting-started/hello-world.md
description: Build your first confidential smart contract with Nox
---

# Hello World

A piggy bank is a simple savings container: you put money in, and only the owner
can take it out. In this tutorial, you will first write a classic piggy bank,
then turn it into a confidential one using Nox. By the end, balances and amounts
will be fully encrypted: nobody can see how much is inside.

## Write a simple contract

Start with a standard Solidity contract. Nothing encrypted yet:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract PiggyBank {
    uint256 private balance;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function deposit(uint256 amount) external {
        balance += amount;
    }

    function withdraw(uint256 amount) external {
        require(msg.sender == owner);
        require(amount <= balance);
        balance -= amount;
    }

    function getBalance() external view returns (uint256) {
        return balance;
    }
}
```

This works, but the balance is visible to anyone reading the blockchain. Let's
fix that.

## Turn it into a confidential contract

Nox provides **confidentiality**, not anonymity. Addresses and function calls
remain visible on-chain, only **balances and amounts** are encrypted.

:::steps

1. ### Drop the public balance reader

   Delete `getBalance()`. In a confidential contract, the balance is only
   readable through the JS SDK `decrypt()` call with an on-chain ACL check — a
   public Solidity getter would expose the encrypted handle but not the value.

   ```solidity
   function getBalance() external view returns (uint256) { // [!code --]
       return balance; // [!code --]
   } // [!code --]
   ```

2. ### Import Nox and update types

   Add the Nox library and swap `uint256` for `euint256`. On-chain, the value is
   now stored as a 32-byte **handle** that points to encrypted data. The actual
   value is never visible.

   ```solidity
   import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol"; // [!code ++]

   contract ConfidentialPiggyBank {
       uint256 private balance; // [!code --]
       euint256 public balance; // [!code ++]
   ```

3. ### Initialize encrypted state

   Unlike plain `uint256` (which defaults to `0`), an `euint256` must be
   explicitly initialized to a valid encrypted handle. Use `Nox.toEuint256()` in
   the constructor:

   ```solidity
   constructor() {
       owner = msg.sender;
       balance = Nox.toEuint256(0); // [!code ++]
   }
   ```

4. ### Convert `deposit()`

   Users encrypt values off-chain with the JS SDK and send a **handle** (a
   reference to the encrypted data) along with a **proof** that the encryption
   is valid. Replace the plain parameter with `externalEuint256`, then call
   `Nox.fromExternal()` to verify the proof and convert the external handle into
   an `euint256` the contract can use. Finally, use `Nox.add()` instead of `+=`:

   ```solidity
   function deposit(uint256 amount) external { // [!code --]
       balance += amount; // [!code --]
   } // [!code --]
   function deposit(externalEuint256 inputHandle, bytes calldata inputProof) external { // [!code ++]
       euint256 amount = Nox.fromExternal(inputHandle, inputProof); // [!code ++]
       balance = Nox.add(balance, amount); // [!code ++]
   } // [!code ++]
   ```

5. ### Convert `withdraw()`

   The `require(amount <= balance)` check cannot work on encrypted values.
   Replace it with `Nox.sub()`, which subtracts two encrypted values:

   ```solidity
   function withdraw(uint256 amount) external { // [!code --]
       require(msg.sender == owner); // [!code --]
       require(amount <= balance); // [!code --]
       balance -= amount; // [!code --]
   } // [!code --]
   function withdraw(externalEuint256 inputHandle, bytes calldata inputProof) external { // [!code ++]
       require(msg.sender == owner); // [!code ++]
       euint256 amount = Nox.fromExternal(inputHandle, inputProof); // [!code ++]
       balance = Nox.sub(balance, amount); // [!code ++]
   } // [!code ++]
   ```

6. ### Grant permissions

   By default, only the handle creator has access. After each operation that
   produces a new handle, you need to grant two permissions:

   * `Nox.allowThis(balance)`: lets the **contract** reuse the handle in future
     computations
   * `Nox.allow(balance, owner)`: lets the **owner** decrypt the balance
     off-chain

   ::: warning #1 NOX bug for new developers
   Forgetting `Nox.allowThis` and `Nox.allow` after each operation makes the
   handle inaccessible on the next transaction. Transient access is cleared at
   end-of-tx — always grant permissions before the function returns.
   :::

   Add both calls at the end of the constructor, `deposit()`, and `withdraw()`:

   ```solidity
   constructor() {
       owner = msg.sender;
       balance = Nox.toEuint256(0);
       Nox.allowThis(balance); // [!code ++]
       Nox.allow(balance, owner); // [!code ++]
   }

   function deposit(externalEuint256 inputHandle, bytes calldata inputProof) external {
       euint256 amount = Nox.fromExternal(inputHandle, inputProof);
       balance = Nox.add(balance, amount);
       Nox.allowThis(balance); // [!code ++]
       Nox.allow(balance, owner); // [!code ++]
   }

   function withdraw(externalEuint256 inputHandle, bytes calldata inputProof) external {
       require(msg.sender == owner);
       euint256 amount = Nox.fromExternal(inputHandle, inputProof);
       balance = Nox.sub(balance, amount);
       Nox.allowThis(balance); // [!code ++]
       Nox.allow(balance, owner); // [!code ++]
   }
   ```

:::

::: warning Overflow and wrapping behavior

`Nox.add()` and `Nox.sub()` use wrapping arithmetic: if the result exceeds the
type's range, it wraps around instead of reverting. For production contracts,
use `Nox.safeAdd()` / `Nox.safeSub()` combined with `Nox.select()` to handle
overflows and underflows gracefully without leaking information. See the
[Solidity Library reference](/references/solidity-library/getting-started) for
details.

:::

## Final result

Here is the complete confidential piggy bank. Click **Open in Remix** to load
it, then compile with Solidity `0.8.27+`. To deploy, select **WalletConnect** or
**Browser Extension** in the Remix **Deploy** panel and make sure your wallet is
connected to **Ethereum Sepolia** before hitting **Deploy**.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// A piggy bank is a simple savings container: you put money in
// and only the owner can take it out. This version keeps the
// balance encrypted so nobody can see how much is inside.

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

contract ConfidentialPiggyBank {
    euint256 public balance;
    address public owner;

    constructor() {
        owner = msg.sender;
        balance = Nox.toEuint256(0);
        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }

    function deposit(externalEuint256 inputHandle, bytes calldata inputProof) external {
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);
        balance = Nox.add(balance, amount);
        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }

    function withdraw(externalEuint256 inputHandle, bytes calldata inputProof) external {
        require(msg.sender == owner);
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);
        balance = Nox.sub(balance, amount);
        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }
}
```

## Try it

Use the widget below to encrypt values and decrypt handles with the JS SDK.
Connect your wallet, enter your deployed contract address, and encrypt an
amount. Copy the resulting **handle** and **handle proof**, then paste them into
the `deposit` or `withdraw` fields in Remix to call the contract. To read the
balance, copy the handle returned by `balance()` in Remix and decrypt it here.

## Next steps

* [Solidity Library](/references/solidity-library/getting-started) - Full
  reference for all Nox operations
* [JS SDK](/references/js-sdk) - Encrypt inputs and decrypt results from
  JavaScript
