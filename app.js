import { HashConnect } from "hashconnect";
import {
    Client,
    AccountId,
    Hbar,
    TransferTransaction,
} from "@hashgraph/sdk";

const connectBtn = document.getElementById("connectButton");
const sendBtn = document.getElementById("sendButton");
const walletAddressEl = document.getElementById("walletAddress");
const statusEl = document.getElementById("status");

let hashconnect = new HashConnect();
let savedPairingData = null;
let provider = null;

async function initHashConnect() {
    let appMetadata = {
        name: "Hedera HBAR dApp",
        description: "Transfer HBAR via HashPack",
        icon: "https://upload.wikimedia.org/wikipedia/commons/3/37/Hedera-logo.png"
    };

    const initData = await hashconnect.init(appMetadata, "testnet", false);
    const state = await hashconnect.connect();

    hashconnect.pairingEvent.on((pairingData) => {
        savedPairingData = pairingData;
        const accountId = pairingData.accountIds[0];
        walletAddressEl.innerText = `Connected: ${accountId}`;
        provider = hashconnect.getProvider("testnet", pairingData.topic, accountId);
    });

    const pairingString = hashconnect.generatePairingString(state, "testnet", false);
    hashconnect.connectToLocalWallet(pairingString);
}

connectBtn.onclick = initHashConnect;

sendBtn.onclick = async () => {
    const recipientId = document.getElementById("recipientId").value;
    const amount = parseFloat(document.getElementById("amount").value);
    if (!provider || !recipientId || isNaN(amount)) {
        statusEl.innerText = "Ensure wallet is connected and fields are filled correctly.";
        return;
    }

    try {
        const signer = hashconnect.getSigner(provider);
        const transaction = await new TransferTransaction()
            .addHbarTransfer(signer.accountId, new Hbar(-amount))
            .addHbarTransfer(recipientId, new Hbar(amount))
            .freezeWithSigner(signer);

        const txResponse = await transaction.executeWithSigner(signer);
        statusEl.innerText = `✅ Sent! TX ID: ${txResponse.transactionId}`;
    } catch (error) {
        console.error(error);
        statusEl.innerText = `❌ Error: ${error.message}`;
    }
};
