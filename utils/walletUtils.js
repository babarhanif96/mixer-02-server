
// Import Web3 library
const Web3 = require('web3');
require('dotenv').config();

// Initialize Web3 instance with an Ethereum node provider (e.g., Infura)
const web3 = new Web3(process.env.RPC_URL);
function createWallet() {
    const account = web3.eth.accounts.create();
    const privateKey = account.privateKey;
    const publicAddress = account.address;

    return { privateKey, publicAddress };
}

// Function to check the ETH balance of a given address
async function checkEthBalance(address) {
    try {
        const balanceWei = await web3.eth.getBalance(address);
        const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
        return balanceEth;
    } catch (error) {
        console.error('Error checking balance:', error);
        throw error;
    }
}

// Function to send funds from one wallet to another
const sendFunds = async (fromWallet, toWallet, amount, privateKey) => {
    try {
        const fromAccount = web3.eth.accounts.privateKeyToAccount(privateKey);
        web3.eth.accounts.wallet.add(fromAccount);

        // Fetch the latest gas price right before sending the transaction
        const gasPrice = await web3.eth.getGasPrice();
        const gasPriceWithBuffer = web3.utils.toBN(gasPrice).add(web3.utils.toBN(web3.utils.toWei('1', 'gwei'))); // Add 1 Gwei buffer

        // Calculate the total transaction cost
        const gasLimit = web3.utils.toBN(21000); // Gas limit for a simple ETH transfer
        const totalCost = gasPriceWithBuffer.mul(gasLimit).add(web3.utils.toBN(web3.utils.toWei(amount.toString(), 'ether')));

        // Fetch the balance of the sender
        const balance = await web3.eth.getBalance(fromWallet);

        // Check if there are sufficient funds
        if (web3.utils.toBN(balance).lt(totalCost)) {
            throw new Error(`Insufficient funds: balance ${balance}, required ${totalCost}`);
        }

        // Create and sign the transaction
        const tx = {
            from: fromWallet,
            to: toWallet,
            value: web3.utils.toWei(amount.toString(), 'ether'), // Convert Ether to Wei
            gas: gasLimit.toString(), // Gas limit for a simple ETH transfer
            gasPrice: gasPriceWithBuffer.toString() // Set the gas price with the buffer
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log(`Transaction successful with hash: ${receipt.transactionHash}`);
    } catch (error) {
        console.error(`Error sending funds from ${fromWallet} to ${toWallet}:`, error);
        throw new Error('Error sending funds.');
    }
};


module.exports = {
    createWallet,
    checkEthBalance,
    sendFunds
};
