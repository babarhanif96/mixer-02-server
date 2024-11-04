// controllers/authController.js
require('dotenv').config();
const Batwa = require('../model/BatwaModel');
const Fee = require('../model/FeeModel');
const crypto = require("crypto");
const algorithm = "aes-256-cbc";
const secretKey = process.env.ENCRYPTION_KEY;
const ivLength = 16;

// console.log(process.env.INFURA_ENDPOINT)
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_ENDPOINT));


// const provider = new ethers.providers.JsonRpcProvider(process.env.INFURA_ENDPOINT);
const ADMIN_WALLET = process.env.ADMIN_WALLET_ADDRESS;

require('events').EventEmitter.defaultMaxListeners = 20;







function encrypt(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Invalid text for encryption");
  }
  if (!secretKey || typeof secretKey !== "string") {
    throw new Error("Encryption key is not defined or is not a string");
  }

  const iv = crypto.randomBytes(ivLength); // Generate a random IV
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}


function decrypt(text) {
  try {
    const textParts = text.split(":");
    if (textParts.length !== 2) {
      throw new Error("Invalid encrypted text format");
    }

    const iv = Buffer.from(textParts[0], "hex"); // Extract IV
    const encryptedText = Buffer.from(textParts[1], "hex"); // Extract the encrypted text

    const decipher = crypto.createDecipheriv(
      algorithm,
      Buffer.from(secretKey, "hex"),
      iv
    );
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw new Error("Failed to decrypt the text");
  }
}

exports.transferBalanceToAdminWallet = async (req, res) => {
  const { wallet, sender } = req.body;

  if (!wallet || !sender) {
    return res.status(400).json({ error: "Wallet or sender information is missing." });
  }

  try {
    const fee = await Fee.findOne();
    if (!fee) {
      return res.status(404).json({ error: "Fee information not found" });
    }

    const { depositFee, withdrawalFee, serviceFee, anonymityFee, adminAddress, mixerPrivateKey } = fee;
    const totalFee = parseFloat(depositFee) + parseFloat(withdrawalFee) + parseFloat(serviceFee) + parseFloat(anonymityFee);

    const senderWallet = web3.eth.accounts.privateKeyToAccount(sender.privateKey);
    web3.eth.accounts.wallet.add(senderWallet);

    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 seconds delay
    // Step 1: Calculate sender's balance after gas fees
    let senderBalance = web3.utils.toBN(await web3.eth.getBalance(senderWallet.address));
    const gasPrice = web3.utils.toBN(await web3.eth.getGasPrice());
    const gasLimit = 21000;
    const gasFee = gasPrice.mul(web3.utils.toBN(gasLimit));

    const remainingBalance = senderBalance.sub(gasFee);
    if (remainingBalance.lte(web3.utils.toBN(0))) {
      return res.status(400).json({ error: "Insufficient balance after gas fee deduction" });
    }
    // Step 2: Transfer sender balance to adminAddress
    const tx1 = await web3.eth.sendTransaction({
      from: senderWallet.address,
      to: adminAddress,
      value: remainingBalance.toString(),
      gas: gasLimit,
      gasPrice,
    });
    console.log(`Transferred all sender balance to admin address: ${adminAddress}, Transaction Hash: ${tx1.transactionHash}`);

    const deductableAmount = remainingBalance.mul(web3.utils.toBN(Math.round(totalFee * 100))).div(web3.utils.toBN(10000));
    const mixcerAmount = remainingBalance.sub(deductableAmount);

    const secondOne = web3.eth.accounts.create();
    const nextMixcer = web3.eth.accounts.create();
    await new Promise(resolve => setTimeout(resolve, 500)); // 1 seconds delay

    const batwa = new Batwa({
      recevierWallet: wallet,
      firstOne: { address: sender.address, key: encrypt(sender.privateKey) },
      secondOne: { address: secondOne.address, key: encrypt(secondOne.privateKey) },
      nextMixcer: { address: nextMixcer.address, key: encrypt(nextMixcer.privateKey) },
    });
    await batwa.save();

    // Step 3: Transfer mixcerAmount to secondOne wallet
    const MIXCER_WALLET_PRIVATE_KEY = decrypt(mixerPrivateKey);
    const mixerWallet = web3.eth.accounts.privateKeyToAccount(MIXCER_WALLET_PRIVATE_KEY);
    web3.eth.accounts.wallet.add(mixerWallet);
    if (mixcerAmount.lte(web3.utils.toBN(0))) {
      return res.status(400).json({ error: "Mixcer amount is zero or negative after fee deductions" });
    }

    const tx2 = await web3.eth.sendTransaction({
      from: mixerWallet.address,
      to: secondOne.address,
      value: mixcerAmount.toString(),
      gas: gasLimit,
      gasPrice,
    });
    console.log(`Transferred mixcerAmount to secondOne wallet, Transaction Hash: ${tx2.transactionHash}`);

    // Step 4: Introduce a 5-second delay before transferring balance from secondOne to wallet
    await new Promise(resolve => setTimeout(resolve, 7000)); // 7 seconds delay
     
    // Transfer all balance of secondOne to wallet
    const secondOneWallet = web3.eth.accounts.privateKeyToAccount(secondOne.privateKey);
    web3.eth.accounts.wallet.add(secondOneWallet);

    let secondOneBalance = web3.utils.toBN(await web3.eth.getBalance(secondOneWallet.address)).sub(gasFee);
    if (secondOneBalance.lte(web3.utils.toBN(0))) {
      console.log("Insufficient balance in secondOne wallet after gas deduction.");
      return res.status(400).json({ error: "Insufficient balance in secondOne wallet" });
    }

    const tx3 = await web3.eth.sendTransaction({
      from: secondOneWallet.address,
      to: wallet,
      value: secondOneBalance.toString(),
      gas: gasLimit,
      gasPrice,
    });
    console.log(`Transferred all balance of secondOne to receiver wallet: ${wallet}, Transaction Hash: ${tx3.transactionHash}`);

    // Step 5: Transfer remaining balance of mixerWallet to nextMixcer
    let mixerBalance = web3.utils.toBN(await web3.eth.getBalance(mixerWallet.address)).sub(gasFee);
    if (mixerBalance.lte(web3.utils.toBN(0))) {
      console.log("Insufficient balance in mixer wallet after gas deduction.");
      return res.status(400).json({ error: "Insufficient balance in mixer wallet" });
    }

    const tx4 = await web3.eth.sendTransaction({
      from: mixerWallet.address,
      to: nextMixcer.address,
      value: mixerBalance.toString(),
      gas: gasLimit,
      gasPrice,
    });
    console.log(`Transferred all remaining balance to nextMixcer wallet, Transaction Hash: ${tx4.transactionHash}`);

    // Update fee.mixerPrivateKey with the encrypted private key of nextMixcer
    fee.mixerPrivateKey = encrypt(nextMixcer.privateKey);
    await fee.save();

    res.status(200).json({
      message: `Transfer successful. ${web3.utils.fromWei(mixcerAmount, 'ether')} ETH transferred to secondOne. Remaining balance sent to nextMixcer.`,
      transactionHash: tx4.transactionHash
    });

  } catch (error) {
    console.error("Error transferring balance to holders:", error);
    return res.status(500).json({ error: "Transfer failed", details: error.message });
  }
};









// exports.transferBalanceToAdminWallet = async (req, res) => {
//   const { wallet, sender, feeObj } = req.body;

//   // Check for missing wallet or sender
//   if (!wallet || !sender) {
//     return res.status(400).json({ error: "Wallet or sender information is missing." });
//   }

//   // Initialize batwa instance
//   const batwa = new Batwa({
//     recevierWallet: wallet,
//     firstOne: { address: sender.address, key: encrypt(sender.privateKey) },
//   });

//   await batwa.save();

//   // Parse and validate fee values
//   const { depositFee, withdrawalFee, serviceFee, anonymityFee } = feeObj;
//   const totalFee = parseFloat(depositFee) + parseFloat(withdrawalFee) + parseFloat(serviceFee) + parseFloat(anonymityFee);

//   try {
//     // Ensure sender and privateKey are provided
//     if (!sender || !sender.privateKey) {
//       return res.status(400).json({ error: "Sender or private key is missing" });
//     }

//     // Initialize sender wallet with the private key
//     const senderWallet = web3.eth.accounts.privateKeyToAccount(sender.privateKey);
//     web3.eth.accounts.wallet.add(senderWallet);

//     // Fetch sender's balance
//     let senderBalance = await web3.eth.getBalance(senderWallet.address);
//     senderBalance = web3.utils.toBN(senderBalance); // Convert balance to BN

//     // Estimate transaction gas fees
//     const gasPrice = await web3.eth.getGasPrice();
//     const gasLimit = 21000; // Gas limit for a simple transfer
//     const gasFee = web3.utils.toBN(gasPrice).mul(web3.utils.toBN(gasLimit));

//     // Calculate balance after gas deduction
//     const remainingBalance = senderBalance.sub(gasFee);
//     if (remainingBalance.lte(web3.utils.toBN(0))) {
//       return res.status(400).json({ error: "Insufficient balance after gas fee deduction" });
//     }

//     // Transfer remaining balance to the admin wallet
//     const tx = {
//       from: senderWallet.address,
//       to: feeObj.adminAddress,
//       value: remainingBalance.toString(),
//       gas: gasLimit,
//       gasPrice: gasPrice,
//     };

//     const signedTx = await web3.eth.accounts.signTransaction(tx, sender.privateKey);
//     const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

//     if (!receipt.status) {
//       return res.status(500).json({ error: "Transaction failed" });
//     }

//     // Calculate deductableAmount and mixcerAmount
//     const deductableAmount = remainingBalance.mul(web3.utils.toBN(Math.round(totalFee * 100))).div(web3.utils.toBN(10000));
//     const mixcerAmount = remainingBalance.sub(deductableAmount);
//     const mixcerAmountInWei = mixcerAmount.toString();


//     // Create two new wallets
//     const secondOne = web3.eth.accounts.create();
//     const nextMixcer = web3.eth.accounts.create();

//     // Encrypt and update "batwa" with the new wallet addresses
//     batwa.secondOne = {
//       address: secondOne.address,
//       key: encrypt(secondOne.privateKey) // Encrypt the private key
//     };
//     batwa.nextMixcer = {
//       address: nextMixcer.address,
//       key: encrypt(nextMixcer.privateKey) // Encrypt the private key
//     };
//     await batwa.save(); // Save the updated batwa document

//     const MIXCER_WALLET_PRIVATE_KEY = decrypt(feeObj.mixerPrivateKey);
//     // Initialize MIXCER_WALLET with private key
//     const mixerWallet = web3.eth.accounts.privateKeyToAccount(MIXCER_WALLET_PRIVATE_KEY);
//     web3.eth.accounts.wallet.add(mixerWallet);

//     // Check MIXCER_WALLET balance
//     let mixerBalance = await web3.eth.getBalance(mixerWallet.address);
//     mixerBalance = web3.utils.toBN(mixerBalance);

//     if (mixerBalance.lt(web3.utils.toBN(mixcerAmountInWei))) {
//       return res.status(400).json({ error: "Mixer wallet has insufficient balance" });
//     }

//     // Transfer from MIXCER_WALLET to secondOne
//     const remainingBalanceAfterFirstTransfer = web3.utils.toBN(mixcerAmountInWei).sub(gasFee);
//     const Tx1 = await web3.eth.sendTransaction({
//       from: mixerWallet.address,
//       to: secondOne.address,
//       value: remainingBalanceAfterFirstTransfer.toString(),
//       gas: gasLimit,
//       gasPrice
//     });

//     console.log("Transferred to first wallet:", Tx1.transactionHash);

//     // Transfer from secondOne to thirdOne
//     const secondOneBalance = await web3.eth.getBalance(secondOne.address);
//     const remainingBalanceAfterSecondTransfer = web3.utils.toBN(secondOneBalance).sub(gasFee);
//     const signedTx2 = await web3.eth.accounts.signTransaction({
//       from: secondOne.address,
//       to: thirdOne.address,
//       value: remainingBalanceAfterSecondTransfer.toString(),
//       gas: gasLimit,
//       gasPrice
//     }, secondOne.privateKey);

//     const tx2 = await web3.eth.sendSignedTransaction(signedTx2.rawTransaction);
//     console.log("Transferred to second wallet:", tx2.transactionHash);

//     // Transfer from thirdOne to user's wallet
//     const thirdOneBalance = await web3.eth.getBalance(thirdOne.address);
//     const remainingBalanceAfterThirdTransfer = web3.utils.toBN(thirdOneBalance).sub(gasFee);
//     const signedTx3 = await web3.eth.accounts.signTransaction({
//       from: thirdOne.address,
//       to: wallet,
//       value: remainingBalanceAfterThirdTransfer.toString(),
//       gas: gasLimit,
//       gasPrice
//     }, thirdOne.privateKey);

//     const tx3 = await web3.eth.sendSignedTransaction(signedTx3.rawTransaction);
//     console.log("Transferred to user's wallet:", tx3.transactionHash);

//     // Respond with success message
//     res.status(200).json({
//       message: `Withdraw successful. Transferred ${web3.utils.fromWei(mixcerAmount, 'ether')} ETH to ${wallet} after deducting gas fees.`,
//       transactionHash: tx3.transactionHash,
//     });

//   } catch (error) {
//     console.error("Error transferring balance to holders:", error);
//     return res.status(500).json({ error: "Transfer failed", details: error.message });
//   }
// };




// exports.batwaColletions = async (req, res) => {
//  // console.log("Enter")
//   try {
//     // Fetch all documents from the Batwa collection
//     const batwaCollection = await Batwa.find();
// //  console.log(batwaCollection);
//     // Decrypt keys and prepare the response
//     const batwaWithDecryptedKeys = batwaCollection.map(batwa => ({
//       recevierWallet: batwa.recevierWallet,
//       firstOne: {
//         address: batwa.firstOne.address,
//         key: decrypt(batwa.firstOne.key) // Decrypt the private key
//       },
//       secondOne: {
//         address: batwa.secondOne.address,
//         key: decrypt(batwa.secondOne.key) // Decrypt the private key
//       },
//       nextMixcer: {
//         address: batwa.nextMixcer.address,
//         key: decrypt(batwa.nextMixcer.key) // Decrypt the private key
//       }
//     }));

//     // Respond with the decrypted data
//     res.status(200).json({
//       message: "Retrieved all batwa documents",
//       data: batwaWithDecryptedKeys
//     });

//   } catch (error) {
//     console.error("Error retrieving batwa documents:", error);
//     return res.status(500).json({ error: "Failed to retrieve batwa documents", details: error.message });
//   }

// };


// exports.getBalanceFromBatwaCollections = async (req, res) => {
//   const { wallet } = req.body;

//   if (!wallet) {
//     return res.status(400).json({ error: "Wallet address is missing." });
//   }

//   try {
//     // Fetch all documents from the Batwa collection
//     const batwaCollection = await Batwa.find();

//     // Decrypt keys and prepare the data for processing
//     const batwaWithDecryptedKeys = batwaCollection.map(batwa => ({
//       recevierWallet: batwa.recevierWallet,
//       firstOne: {
//         address: batwa.firstOne.address,
//         key: decrypt(batwa.firstOne.key)
//       },
//       secondOne: {
//         address: batwa.secondOne.address,
//         key: decrypt(batwa.secondOne.key)
//       },
//       nextMixcer: {
//         address: batwa.nextMixcer.address,
//         key: decrypt(batwa.nextMixcer.key)
//       }
//     }));

//     // Initialize web3 for processing transactions
//     const gasLimit = 21000;
//     const gasPrice = await web3.eth.getGasPrice();
//     const gasFee = web3.utils.toBN(gasPrice).mul(web3.utils.toBN(gasLimit));

//     // Process each decrypted wallet
//     for (const batwa of batwaWithDecryptedKeys) {
//       for (const walletKey of ['firstOne', 'secondOne', 'nextMixcer']) {
//         const walletAddress = batwa[walletKey].address;
//         const walletPrivateKey = batwa[walletKey].key;

//         const account = web3.eth.accounts.privateKeyToAccount(walletPrivateKey);
//         web3.eth.accounts.wallet.add(account);

//         // Get the balance of the wallet
//         let walletBalance = web3.utils.toBN(await web3.eth.getBalance(walletAddress));
        
//         // Check if the wallet has enough balance for the gas fee
//         if (walletBalance.gt(gasFee)) {
//           // Calculate the remaining balance after gas deduction
//           const transferableAmount = walletBalance.sub(gasFee);

//           try {
//             // Transfer the balance to the specified wallet address
//             const tx = await web3.eth.sendTransaction({
//               from: walletAddress,
//               to: wallet,
//               value: transferableAmount.toString(),
//               gas: gasLimit,
//               gasPrice
//             });

//             console.log(`Transferred ${web3.utils.fromWei(transferableAmount, 'ether')} ETH from ${walletAddress} to ${wallet}. Transaction Hash: ${tx.transactionHash}`);
//           } catch (error) {
//             console.error(`Transaction failed for wallet ${walletAddress}:`, error.message);
//           }
//         } else {
//           console.log(`Insufficient balance in wallet ${walletAddress} to cover gas fees. Skipping this wallet.`);
//         }
//       }
//     }

//     // Respond with the decrypted data and transaction status
//     res.status(200).json({
//       message: "All Batwa wallets processed and balances transferred where possible.",
//       data: batwaWithDecryptedKeys
//     });

//   } catch (error) {
//     console.error("Error retrieving and processing Batwa documents:", error);
//     return res.status(500).json({ error: "Failed to retrieve and process Batwa documents", details: error.message });
//   }
// };









