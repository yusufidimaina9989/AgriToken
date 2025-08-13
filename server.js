require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TransferTransaction,
  AccountBalanceQuery,
  Hbar,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  TopicId,
  TransactionId,
  TokenAssociateTransaction,
} = require("@hashgraph/sdk");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "public")));

const myAccountId = AccountId.fromString(process.env.MY_ACCOUNT_ID);
const myPrivateKey = PrivateKey.fromString(process.env.MY_PRIVATE_KEY);
const network = process.env.HEDERA_NETWORK || "testnet";

let client;
if (network === "mainnet") {
  client = Client.forMainnet();
} else {
  client = Client.forTestnet();
}
client.setOperator(myAccountId, myPrivateKey);

const farmers = new Map();
const tokenizedAssets = new Map();
const investments = new Map();
const farmRatings = new Map();
let agriTokenTopicId = null;

async function initializeAgriTokenTopic() {
  try {
    // create new topic
    const topicCreateTx = new TopicCreateTransaction()
      .setTopicMemo("AgriToken - Tokenized Agricultural Assets")
      .setSubmitKey(myPrivateKey);

    const topicCreateSubmit = await topicCreateTx.execute(client);
    const topicCreateReceipt = await topicCreateSubmit.getReceipt(client);
    agriTokenTopicId = topicCreateReceipt.topicId;

    console.log(`Created AgriToken Topic ID: ${agriTokenTopicId}`);

    // Submit initial message
    const initialMessage = {
      type: "SYSTEM_INIT",
      message: "AgriToken platform initialized",
      timestamp: new Date().toISOString(),
    };

    await submitTopicMessage(JSON.stringify(initialMessage));
  } catch (error) {
    console.error("Error initializing topic:", error);

    if (process.env.AGRITOKEN_TOPIC_ID) {
      agriTokenTopicId = TopicId.fromString(process.env.AGRITOKEN_TOPIC_ID);
      console.log(`Using existing AgriToken Topic ID: ${agriTokenTopicId}`);
    } else {
      throw new Error(
        "Failed to initialize topic and no fallback topic ID provided"
      );
    }
  }
}

async function submitTopicMessage(message) {
  if (!agriTokenTopicId) return;

  try {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(agriTokenTopicId)
      .setMessage(message)
      .execute(client);
    await tx.getReceipt(client);
  } catch (error) {
    console.error("Error submitting message:", error);
  }
}

async function rehydrateStateFromHCS() {
  return new Promise((resolve, reject) => {
    if (!agriTokenTopicId) {
      console.log("No topic ID available for rehydration");
      return resolve();
    }

    const messages = [];
    let subscription;

    const timeout = setTimeout(() => {
      if (subscription) subscription.unsubscribe();
      processMessages();
    }, 5000);

    subscription = new TopicMessageQuery()
      .setTopicId(agriTokenTopicId)
      .setStartTime(0)
      .subscribe(
        client,
        null,
        (msg) => {
          try {
            const parsed = JSON.parse(msg.contents.toString());
            messages.push(parsed);
          } catch (e) {
            console.error("Skipping invalid message:", e.message);
          }
        },
        (err) => {
          clearTimeout(timeout);
          console.error("Subscription error:", err);
          reject(err);
        }
      );

    function processMessages() {
      clearTimeout(timeout);
      if (subscription) subscription.unsubscribe();

      messages.forEach((msg) => {
        switch (msg.type) {
          case "FARMER_REGISTERED":
            farmers.set(msg.id, msg);
            break;
          case "ASSET_TOKENIZED":
            tokenizedAssets.set(msg.id, msg);
            const farmer = farmers.get(msg.farmerId);
            if (farmer && !farmer.assets.includes(msg.id)) {
              farmer.assets.push(msg.id);
            }
            break;
          case "INVESTMENT_MADE":
            investments.set(msg.id, msg);
            const asset = tokenizedAssets.get(msg.assetId);
            if (asset) {
              asset.remainingAmount -= msg.tokenAmount;
              if (asset.remainingAmount <= 0) {
                asset.status = "fully_invested";
              }
            }
            break;
        }
      });

      console.log("Rehydrated state from HCS:", {
        farmers: farmers.size,
        tokenizedAssets: tokenizedAssets.size,
        investments: investments.size,
      });

      resolve();
    }
  });
}

app.get("/api/users/:accountId", (req, res) => {
  try {
    const accountId = req.params.accountId.toLowerCase();
    const user = Array.from(farmers.values()).find(
      (f) => f.id.toLowerCase() === accountId
    );

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Farmer endpoint
app.post("/api/farmers", async (req, res) => {
  try {
    const { accountId, name, nin, location, phone, assets, role } = req.body;

    const farmerId = accountId.toLowerCase();

    const farmer = {
      id: farmerId,
      name,
      nin,
      location,
      phone,
      assets: Array.isArray(assets) ? assets : [assets],
      totalTokens: 0,
      role: role || "farmer",
      createdAt: new Date().toISOString(),
    };

    farmers.set(farmerId, farmer);
    console.log(`Registered farmer: ${farmerId}`, farmer);
    await submitTopicMessage(
      JSON.stringify({ type: "FARMER_REGISTERED", ...farmer })
    );
    res.status(201).json(farmer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// tokenization endpoint
app.post("/api/tokenize", async (req, res) => {
  try {
    const {
      farmerId,
      cropType,
      yieldAmount,
      harvestDate,
      tokenPrice,
      roi,
      farmerShare,
    } = req.body;

    const normalizedFarmerId = farmerId.toLowerCase();

    let farmer = farmers.get(normalizedFarmerId);
    farmer.totalTokens = (farmer.totalTokens || 0) + parseInt(yieldAmount);
    farmers.set(farmerId, farmer);
    if (!farmer) {
      return res.status(400).json({
        error: "Farmer not registered. Please complete registration first.",
      });

      farmers.set(farmerId, farmer);
      await submitTopicMessage(
        JSON.stringify({ type: "FARMER_REGISTERED", ...farmer })
      );
    }

    // Create token
    const tokenName = `${cropType} - ${farmer.name}`;
    const tokenSymbol = `${cropType.substring(0, 3).toUpperCase()}${Date.now()
      .toString()
      .slice(-4)}`;
    const tokenCreateTx = new TokenCreateTransaction()
      .setTokenName(tokenName)
      .setTokenSymbol(tokenSymbol)
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(0)
      .setInitialSupply(parseInt(yieldAmount))
      .setTreasuryAccountId(myAccountId)
      .setSupplyKey(myPrivateKey);

    const tokenCreateSubmit = await tokenCreateTx.execute(client);
    const tokenCreateReceipt = await tokenCreateSubmit.getReceipt(client);
    const tokenId = tokenCreateReceipt.tokenId.toString();
    const transactionId = tokenCreateSubmit.transactionId.toString();
    console.log(`Created Token ID: ${tokenId}`);
    console.log(`Token Name: ${tokenName}, Symbol: ${tokenSymbol}`);
    console.log(`Token Price: $${tokenPrice}, Farmer Share: ${farmerShare}%`);
    console.log("token transaction ID:", transactionId);

    // Distribute tokens according to ownership structure
    const farmerTokens = Math.floor(yieldAmount * (farmerShare / 100));
    if (farmerTokens > 0) {
      const transferTx = new TransferTransaction()
        .addTokenTransfer(tokenId, myAccountId, -farmerTokens)
        .addTokenTransfer(tokenId, AccountId.fromString(farmerId), farmerTokens)
        .freezeWith(client);

      const transferTxBytes = await transferTx.toBytes();
      const transferSign = await myPrivateKey.signTransaction(
        TransferTransaction.fromBytes(transferTxBytes)
      );
      const transferSubmit = await (
        await transferTx.execute(client)
      ).getReceipt(client);

      console.log("Transfer successful:", transferSubmit.status.toString());
    }

    // Create asset record
    const assetId = `asset_${Date.now()}`;
    const asset = {
      id: assetId,
      tokenId,
      farmerId,
      farmerName: farmer.name,
      cropType,
      yieldAmount: parseInt(yieldAmount),
      tokenizedAmount: parseInt(yieldAmount),
      remainingAmount: parseInt(yieldAmount) - farmerTokens,
      harvestDate,
      tokenPrice: parseFloat(tokenPrice),
      roi: parseFloat(roi),
      farmerShare: parseInt(farmerShare),
      status: "open",
      createdAt: new Date().toISOString(),
      tokenSymbol: tokenSymbol,
    };

    tokenizedAssets.set(assetId, asset);
    farmer.assets.push(assetId);
    await submitTopicMessage(
      JSON.stringify({ type: "ASSET_TOKENIZED", ...asset })
    );

    res.status(201).json({
      message: "Asset tokenized successfully",
      asset,
      tokenId,
      transactionId,
    });
  } catch (error) {
    console.error("Tokenization error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ratings endpoint
app.post("/api/rate-farm", async (req, res) => {
  try {
    const { farmerId, investorId, rating } = req.body;

    if (!farmers.has(farmerId)) {
      return res.status(404).json({ error: "Farmer not found" });
    }

    const currentRating = farmRatings.get(farmerId) || {
      totalRating: 0,
      ratingCount: 0,
    };
    currentRating.totalRating += parseInt(rating);
    currentRating.ratingCount++;
    farmRatings.set(farmerId, currentRating);

    await submitTopicMessage(
      JSON.stringify({
        type: "FARM_RATED",
        farmerId,
        investorId,
        rating,
        averageRating: currentRating.totalRating / currentRating.ratingCount,
      })
    );

    res.json({
      message: "Rating submitted",
      averageRating: currentRating.totalRating / currentRating.ratingCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// assets endpoint
app.get("/api/assets", (req, res) => {
  try {
    const assets = Array.from(tokenizedAssets.values()).map((asset) => {
      const ratingData = farmRatings.get(asset.farmerId) || {
        totalRating: 0,
        ratingCount: 0,
      };
      return {
        ...asset,
        rating:
          ratingData.ratingCount > 0
            ? (ratingData.totalRating / ratingData.ratingCount).toFixed(1)
            : "Not rated",
        ratingCount: ratingData.ratingCount,
      };
    });
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/farmer-assets/:farmerId", (req, res) => {
  try {
    const farmerId = req.params.farmerId;
    const assets = Array.from(tokenizedAssets.values()).filter(
      (a) => a.farmerId === farmerId
    );
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Investment endpoint
app.post("/api/invest", async (req, res) => {
  try {
    const { assetId, investorAccountId, amount } = req.body;
    const asset = tokenizedAssets.get(assetId);

    if (!asset || asset.status !== "open") {
      return res.status(404).json({ error: "Asset not found or closed" });
    }

    if (amount > asset.remainingAmount) {
      return res.status(400).json({ error: "Not enough tokens available" });
    }

    const transferTx = new TransferTransaction()
      .addTokenTransfer(asset.tokenId, myAccountId, -amount)
      .addTokenTransfer(
        asset.tokenId,
        AccountId.fromString(investorAccountId),
        amount
      )
      .execute(client);
    await (await transferTx).getReceipt(client);

    console.log(
      `Transferred ${amount} tokens of ${asset.tokenId} to ${investorAccountId}`
    );

    asset.remainingAmount -= amount;
    if (asset.remainingAmount === 0) asset.status = "fully_invested";
    tokenizedAssets.set(assetId, asset);

    const investmentId = `inv_${Date.now()}`;
    const totalCost = amount * asset.tokenPrice;
    const hbarAmount = new Hbar(totalCost).toTinybars().toString();

    const investment = {
      id: investmentId,
      assetId,
      investorAccountId,
      tokenAmount: amount,
      totalCostUSD: amount * asset.tokenPrice,
      timestamp: new Date().toISOString(),
    };
    investments.set(investmentId, investment);

    await submitTopicMessage(
      JSON.stringify({
        type: "INVESTMENT_MADE",
        ...investment,
        asset: {
          cropType: asset.cropType,
          farmerName: asset.farmerName,
        },
      })
    );
    console.log("investment ID:", investmentId);
    res.status(200).json({
      message: "Investment successful",
      investment,
      newBalance: asset.remainingAmount,
    });
  } catch (error) {
    console.error("Investment error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/associate", async (req, res) => {
  try {
    const { accountId, tokenId } = req.body;

    const associateTx = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([tokenId])
      .freezeWith(client);

    const associateSign = await associateTx.sign(myPrivateKey);
    const associateSubmit = await associateSign.execute(client);
    const associateReceipt = await associateSubmit.getReceipt(client);

    res.json({
      status: "success",
      transactionId: associateSubmit.transactionId.toString(),
    });
  } catch (error) {
    console.error("Association error:", error);
    res.status(500).json({ error: error.message });
  }
});

// profit distribution
app.post("/api/distribute", async (req, res) => {
  try {
    const { assetId, marketPrice } = req.body;
    const asset = tokenizedAssets.get(assetId);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    const profitPerToken = marketPrice - asset.tokenPrice;
    const totalProfit = profitPerToken * asset.yieldAmount;

    const investmentRecords = Array.from(investments.values()).filter(
      (i) => i.assetId === assetId
    );

    for (const investment of investmentRecords) {
      const investorProfit = profitPerToken * investment.tokenAmount;

      const transferTx = new TransferTransaction()
        .addHbarTransfer(
          myAccountId,
          Hbar.fromTinybars(-investorProfit * 100000000)
        )
        .addHbarTransfer(
          AccountId.fromString(investment.investorAccountId),
          Hbar.fromTinybars(investorProfit * 100000000)
        )
        .execute(client);

      await (await transferTx).getReceipt(client);

      await submitTopicMessage(
        JSON.stringify({
          type: "PROFIT_DISTRIBUTED",
          assetId,
          investorId: investment.investorAccountId,
          tokenAmount: investment.tokenAmount,
          profit: investorProfit,
          timestamp: new Date().toISOString(),
        })
      );
    }

    asset.status = "distributed";
    tokenizedAssets.set(assetId, asset);

    res.json({
      status: "success",
      message: `Distributed ${totalProfit} HBAR in profits to investors`,
    });
  } catch (error) {
    console.error("Distribution error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/investments/:accountId", (req, res) => {
  try {
    const accountId = req.params.accountId;
    const userInvestments = Array.from(investments.values()).filter(
      (i) => i.investorAccountId === accountId
    );

    const enriched = userInvestments.map((i) => {
      const asset = tokenizedAssets.get(i.assetId);
      return {
        ...i,
        asset: asset || { cropType: "Unknown", farmerName: "Unknown" },
        farmerName: asset ? asset.farmerName : "Unknown",
      };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Balance endpoint
app.get("/api/balance/:accountId", async (req, res) => {
  try {
    const balance = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(req.params.accountId))
      .execute(client);

    res.json({
      hbars: balance.hbars.toString(),
      tokens: Object.fromEntries(balance.tokens),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    network,
    operator: myAccountId.toString(),
    topicId: agriTokenTopicId?.toString() || "Not initialized",
    stats: {
      farmers: farmers.size,
      assets: tokenizedAssets.size,
      investments: investments.size,
    },
  });
});

async function startServer() {
  try {
    await initializeAgriTokenTopic();
    await rehydrateStateFromHCS();

    app.listen(port, () => {
      console.log(`AgriToken backend running on port ${port}`);
      console.log(`Hedera Network: ${network}`);
      console.log(`Operator Account: ${myAccountId}`);
      console.log(`AgriToken Topic: ${agriTokenTopicId}`);
      console.log(`API Base URL: http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

startServer();
