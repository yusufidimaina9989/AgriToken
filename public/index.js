const API_BASE_URL = "http://localhost:3001";

document.addEventListener("DOMContentLoaded", () => {
  // Form submission handler
  document
    .getElementById("tokenizeForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();

      if (!connectedAccountId) {
        showNotification("Please connect your wallet first", "error");
        return;
      }

      const cropType = document.getElementById("cropType").value;
      const yieldAmount = document.getElementById("yieldAmount").value;
      const harvestDate = document.getElementById("harvestDate").value;
      const tokenPrice = document.getElementById("tokenPrice").value;
      const roi = document.getElementById("roi").value;
      const farmerShare = document.getElementById("farmerShare").value;

      try {
        const response = await axios.post(`${API_BASE_URL}/api/tokenize`, {
          farmerId: connectedAccountId,
          cropType,
          yieldAmount,
          harvestDate,
          tokenPrice,
          roi,
          farmerShare,
        });

        showNotification("Asset tokenized successfully!", "success");
        this.reset();
        loadUserData();
      } catch (error) {
        console.error("Tokenization error:", error);
        showNotification(
          error.response?.data?.error || "Tokenization failed",
          "error"
        );
      }
    });

  // Ownership slider
  document.getElementById("farmerShare").addEventListener("input", function () {
    document.getElementById("farmerPercent").textContent = `${this.value}%`;
    document.getElementById("investorPercent").textContent = `${
      100 - this.value
    }%`;
  });

  // scroll to top button
  window.addEventListener("scroll", () => {
    const backToTop = document.getElementById("backToTop");
    if (window.pageYOffset > 300) {
      backToTop.classList.add("show");
    } else {
      backToTop.classList.remove("show");
    }
  });

  document.getElementById("backToTop").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

async function checkUserRegistration() {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/users/${connectedAccountId}`
    );

    showNotification(`Welcome back, ${response.data.name}!`, "success");

    if (response.data.role === "investor") {
      document.getElementById("dashboard").style.display = "none";
    } else {
      document.getElementById("dashboard").style.display = "block";
    }

    loadUserData();
  } catch (error) {
    if (error.response && error.response.status === 404) {
      showModal("roleModal");
    } else {
      showNotification(
        "Error checking registration: " + error.message,
        "error"
      );
    }
  }
}

function showModal(modalId) {
  document.getElementById(modalId).classList.add("show");
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.remove("show");
}

document.getElementById("farmerRole").addEventListener("click", () => {
  hideModal("roleModal");
  showModal("registerModal");
});

document.getElementById("investorRole").addEventListener("click", () => {
  hideModal("roleModal");
  showNotification("Investor account activated!", "success");
  document.getElementById("dashboard").style.display = "none";
});

// Farmer registration form
document
  .getElementById("registerForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const farmerData = {
      accountId: connectedAccountId,
      name: document.getElementById("farmerName").value,
      nin: document.getElementById("nin").value,
      location: document.getElementById("location").value,
      phone: document.getElementById("phone").value,
      assets: document
        .getElementById("crops")
        .value.split(",")
        .map((crop) => crop.trim()),
      role: "farmer",
    };

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/farmers`,
        farmerData
      );

      showNotification(
        "Registration successful! Welcome to AgriToken",
        "success"
      );
      hideModal("registerModal");
      document.getElementById("dashboard").style.display = "block";
      loadUserData();
    } catch (error) {
      showNotification(
        "Registration failed: " + error.response?.data?.error || error.message,
        "error"
      );
    }
  });

let connectedAccountId = null;
let provider = null;
let signer = null;
let isManuallyDisconnected = false;

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    showNotification("MetaMask not found. Please install MetaMask.", "error");
    return;
  }
  try {
    const accounts = await window.ethereum.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });

    const accountList = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    connectedAccountId = accountList[0];
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    isManuallyDisconnected = false;
    updateWalletUI();
    checkUserRegistration();
    showNotification("MetaMask connected!", "success");
    loadUserData();
  } catch (error) {
    console.error(error);
    showNotification("Connection failed.", "error");
  }
}

function updateWalletUI() {
  const shortenedAddress = `${connectedAccountId.substring(
    0,
    6
  )}...${connectedAccountId.substring(38)}`;
  document.getElementById("accountId").textContent = shortenedAddress;

  document.getElementById("walletInfo").style.display = "flex";
  document.getElementById("btnText").textContent = "Disconnect";
  document.getElementById("connectWalletBtn").onclick = disconnectWallet;
}

function disconnectWallet() {
  connectedAccountId = null;
  isManuallyDisconnected = true;

  document.getElementById("walletInfo").style.display = "none";
  document.getElementById("btnText").textContent = "Connect Wallet";
  document.getElementById("connectWalletBtn").onclick = connectWallet;

  // Clear displayed data
  document.getElementById("tokenBalance").textContent = "0";
  document.getElementById("tokenValue").textContent = "0";
  document.getElementById("portfolioValue").textContent = "0";
  document.getElementById("tokenizedAssetsList").innerHTML = "";
  document.getElementById("portfolioList").innerHTML = "";
  document.getElementById("assetsGrid").innerHTML = "";

  showNotification("Wallet disconnected", "info");
}

if (typeof window.ethereum !== "undefined") {
  window.ethereum.on("accountsChanged", (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else if (!isManuallyDisconnected) {
      connectedAccountId = accounts[0];
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer = provider.getSigner();
      updateWalletUI();
      loadUserData();
    }
  });
}

document.getElementById("connectWalletBtn").onclick = connectWallet;

function renderBalance(balance) {
  try {
    const tokenAmounts = Object.values(balance.tokens || {}).map((amount) => {
      const num = parseInt(amount);
      return isNaN(num) ? 0 : num;
    });

    const totalTokens = tokenAmounts.reduce((sum, amount) => sum + amount, 0);

    const tokenValue = totalTokens * 0.36;

    document.getElementById("tokenBalance").textContent = totalTokens;
    document.getElementById("tokenValue").textContent = tokenValue.toFixed(2);
    document.getElementById("portfolioValue").textContent =
      tokenValue.toFixed(2);
  } catch (error) {
    console.error("Error rendering balance:", error);
    document.getElementById("tokenBalance").textContent = "0";
    document.getElementById("tokenValue").textContent = "0.00";
    document.getElementById("portfolioValue").textContent = "0.00";
  }
}

function showNotification(msg, type, transactionId = null) {
  const container = document.getElementById("notificationContainer");
  const note = document.createElement("div");
  note.className = `notification ${type}`;

  if (transactionId) {
    const hashscanUrl = `https://hashscan.io/${NETWORK}/transaction/${transactionId}`;
    note.innerHTML = `
                    <i class="fas fa-${
                      type === "success" ? "check-circle" : "exclamation-circle"
                    }"></i>
                    <span>${msg}</span>
                    <a href="${hashscanUrl}" target="_blank" class="tx-link">
                        <i class="fas fa-external-link-alt"></i> View Tx
                    </a>
                `;
  } else {
    note.innerHTML = `
                    <i class="fas fa-${
                      type === "success" ? "check-circle" : "exclamation-circle"
                    }"></i>
                    <span>${msg}</span>
                `;
  }

  container.appendChild(note);

  setTimeout(() => {
    note.style.opacity = "0";
    setTimeout(() => note.remove(), 300);
  }, 5000);
}

async function fetchAssets() {
  const response = await axios.get(`${API_BASE_URL}/api/assets`);
  return response.data;
}

async function fetchInvestments(accountId) {
  const response = await axios.get(
    `${API_BASE_URL}/api/investments/${accountId}`
  );
  return response.data;
}

async function fetchBalance(accountId) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/balance/${accountId}`
    );
    return {
      hbars: response.data.hbars || "0",
      tokens: response.data.tokens || {},
    };
  } catch (error) {
    console.error("Balance fetch error:", error);
    return { hbars: "0", tokens: {} };
  }
}

async function fetchFarmerAssets(farmerId) {
  const response = await axios.get(
    `${API_BASE_URL}/api/farmer-assets/${farmerId}`
  );
  return response.data;
}

async function renderPerformanceChart(investments) {
  const ctx = document.getElementById("performanceChart").getContext("2d");

  const monthlyData = {};
  investments.forEach((inv) => {
    const month = new Date(inv.timestamp).toLocaleString("default", {
      month: "short",
      year: "numeric",
    });
    const value = inv.totalCostUSD;

    if (!monthlyData[month]) {
      monthlyData[month] = 0;
    }
    monthlyData[month] += value;
  });

  const months = Object.keys(monthlyData);
  const values = Object.values(monthlyData);

  const cumulativeValues = [];
  let total = 0;
  values.forEach((val) => {
    total += val;
    cumulativeValues.push(total);
  });

  // Create chart
  new Chart(ctx, {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: "Portfolio Value ($)",
          data: cumulativeValues,
          borderColor: "#2ecc71",
          backgroundColor: "rgba(46, 204, 113, 0.1)",
          borderWidth: 3,
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "top",
        },
        title: {
          display: true,
          text: "Investment Growth",
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(0, 0, 0, 0.05)",
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    },
  });
}

renderPerformanceChart(investments);

async function loadUserData() {
  if (!connectedAccountId) return;

  try {
    const [assets, investments, balance, farmerAssets] = await Promise.all([
      fetchAssets(),
      fetchInvestments(connectedAccountId),
      fetchBalance(connectedAccountId),
      fetchFarmerAssets(connectedAccountId),
    ]);

    renderAssets(assets);
    renderInvestments(investments);
    renderBalance(balance);
    renderFarmerAssets(farmerAssets);
  } catch (error) {
    console.error("Error loading user data:", error);
    showNotification("Failed to load data", "error");
  }
}

async function rateFarm(farmerId, rating) {
  if (!connectedAccountId) {
    showNotification("Please connect wallet to rate farms", "error");
    return;
  }

  try {
    await axios.post(`${API_BASE_URL}/api/rate-farm`, {
      farmerId,
      investorId: connectedAccountId,
      rating,
    });
    showNotification("Farm rating submitted!", "success");
    loadUserData();
  } catch (error) {
    showNotification("Rating failed: " + error.message, "error");
  }
}

async function renderAssets(assets) {
  const assetsGrid = document.getElementById("assetsGrid");
  assetsGrid.innerHTML = "";

  assets.forEach((asset) => {
    const card = document.createElement("div");
    card.className = "asset-card";
    card.innerHTML = `
             <div class="asset-image" style="background-image: url('./images/${
               asset.cropType
             }.png')"></div>
            <div class="asset-content">
                <h3 class="asset-title">${asset.cropType} - ${
      asset.farmerName
    }'s farm</h3>
                <div class="asset-meta">
                    <div class="asset-location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${asset.location || "Nigeria"}</span>
                    </div>
                    <div class="asset-rating">
                        <i class="fas fa-star"></i>
                        <span>${asset.rating} (${
      asset.ratingCount
    } ratings)</span>
                    </div>
                </div>
                <div class="asset-stats">
                  
                    <div class="stat-item">
                        <div class="stat-label">Available Tokens</div>
                        <div class="stat-value">${asset.remainingAmount} (${(
      (asset.remainingAmount / asset.yieldAmount) *
      100
    ).toFixed(1)}%)</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Price</div>
                        <div class="stat-value">$${asset.tokenPrice}/kg</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">ROI</div>
                        <div class="stat-value">${asset.roi}%</div>
                    </div>
                </div>
                
                <div class="asset-rating-controls">
                    <span>Rate this farm:</span>
                    <div class="rating-stars">
                        ${[1, 2, 3, 4, 5]
                          .map(
                            (star) => `
                            <i class="fas fa-star ${
                              asset.userRating >= star ? "rated" : ""
                            }" 
                               onclick="rateFarm('${
                                 asset.farmerId
                               }', ${star})"></i>
                        `
                          )
                          .join("")}
                    </div>
                </div>
                
                <button class="btn-invest" onclick="investIn('${asset.id}')">
                    Invest Now
                </button>
            </div>
        `;
    assetsGrid.appendChild(card);
  });
}

function renderInvestments(investments) {
  const portfolioList = document.getElementById("portfolioList");
  portfolioList.innerHTML = "";

  investments.forEach((inv) => {
    const item = document.createElement("div");
    item.className = "portfolio-item";
    item.innerHTML = `
            <div class="portfolio-header">
                <div class="portfolio-title">${inv.asset.cropType} - ${
      inv.farmerName
    }'s farm</div>
                <div class="portfolio-roi ${
                  inv.asset.roi >= 0 ? "roi-positive" : "roi-negative"
                }">
                    ${inv.asset.roi}% ROI
                </div>
            </div>
            <div class="portfolio-details">
                <div class="detail-item">
                    <div class="detail-label">Tokens</div>
                    <div class="detail-value">${inv.tokenAmount} ${
      inv.asset.tokenSymbol || "AGR"
    }</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Value</div>
                    <div class="detail-value">$${(
                      inv.tokenAmount * inv.asset.tokenPrice
                    ).toFixed(2)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Harvest Date</div>
                    <div class="detail-value">${new Date(
                      inv.asset.harvestDate
                    ).toLocaleDateString()}</div>
                    
                </div>
                <div class="detail-item">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">${
                      inv.asset.status === "open" ? "Active" : "Completed"
                    }</div>
                </div>
            </div>
        `;
    portfolioList.appendChild(item);
  });
}

function renderFarmerAssets(assets) {
  const container = document.getElementById("tokenizedAssetsList");
  container.innerHTML = "";

  assets.forEach((asset) => {
    const farmerTokens = asset.yieldAmount * (asset.farmerShare / 100);
    const farmerValue = farmerTokens * asset.tokenPrice;
    const remainingValue = asset.remainingAmount * asset.tokenPrice;

    const item = document.createElement("div");
    item.className = "portfolio-item";
    item.innerHTML = `
            <div class="portfolio-header">
                <div class="portfolio-title">${asset.cropType} (${
      asset.tokenSymbol || "AGR"
    })</div>
                <div class="portfolio-roi roi-positive">${asset.roi}% ROI</div>
            </div>
            <div class="portfolio-details">
                <div class="detail-item">
                    <div class="detail-label">Your Tokens</div>
                    <div class="detail-value">${farmerTokens.toFixed(0)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Your Value</div>
                    <div class="detail-value">$${farmerValue.toFixed(2)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Remaining</div>
                    <div class="detail-value">${asset.remainingAmount} (${(
      (asset.remainingAmount / asset.yieldAmount) *
      100
    ).toFixed(1)}%)</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Remaining Value</div>
                    <div class="detail-value">$${remainingValue.toFixed(
                      2
                    )}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Harvest Date</div>
                    <div class="detail-value">${new Date(
                      asset.harvestDate
                    ).toLocaleDateString()}</div>
                </div>
            </div>
                 <div class="distribution-controls" id="distributionControls_${
                   asset.id
                 }" style="display: ${
      new Date() > new Date(asset.harvestDate) ? "block" : "none"
    }">
  <button class="btn-distribute" onclick="initDistribution('${asset.id}')">
    <i class="fas fa-money-bill-wave"></i> Distribute Profits
  </button>
</div>
        `;
    container.appendChild(item);
  });
}

async function associateToken(accountId, tokenId) {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/associate`, {
      accountId,
      tokenId,
    });

    showNotification(
      "Account associated with token successfully",
      "success",
      response.data.transactionId
    );
    return true;
  } catch (error) {
    console.error("Association error:", error);
    showNotification("Association failed: " + error.message, "error");
    return false;
  }
}

async function investIn(assetId) {
  if (!connectedAccountId) {
    showNotification("Please connect your wallet first", "error");
    return;
  }

  const { value: amount } = await Swal.fire({
    title: "Invest in Asset",
    icon: "question",
    input: "number",
    inputLabel: "Enter amount to invest (kg)",
    inputPlaceholder: "e.g. 100",
    confirmButtonText: "Invest",
    cancelButtonText: "Cancel",
    showCancelButton: true,
    buttonsStyling: true,
    customClass: {
      confirmButton: "custom-confirm-button",
      cancelButton: "custom-cancel-button",
    },
    inputAttributes: {
      min: 1,
      step: 1,
    },
    inputValidator: (value) => {
      if (!value || isNaN(value) || Number(value) <= 0) {
        return "Please enter a valid positive number.";
      }
    },
  });

  if (!amount) return;

  const { isConfirmed } = await Swal.fire({
    title: `Confirm investment of ${amount} kg?`,
    icon: "info",
    showCancelButton: true,
    confirmButtonText: "Yes, invest",
    cancelButtonText: "Back",
    buttonsStyling: true,
    customClass: {
      confirmButton: "custom-confirm-button",
      cancelButton: "custom-cancel-button",
    },
  });

  if (!isConfirmed) return;

  try {
    const response = await axios.post(`${API_BASE_URL}/api/invest`, {
      assetId,
      investorAccountId: connectedAccountId,
      amount: parseInt(amount),
    });

    showNotification(response.data.message, "success");
    loadUserData();
  } catch (error) {
    console.error("Investment error:", error);
    showNotification(
      error.response?.data?.error || "Investment failed",
      "error"
    );
  }

  async function initDistribution(assetId) {
    const { value: marketPrice } = await Swal.fire({
      title: "Distribute Profits",
      input: "number",
      inputLabel: "Current Market Price (per kg)",
      inputPlaceholder: "e.g. 1.25",
      confirmButtonText: "Distribute",
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value || isNaN(value) || value <= 0) {
          return "Please enter a valid market price";
        }
      },
    });

    if (!marketPrice) return;

    try {
      const response = await axios.post(`${API_BASE_URL}/api/distribute`, {
        assetId,
        marketPrice: parseFloat(marketPrice),
      });

      showNotification(response.data.message, "success");
      loadUserData();
    } catch (error) {
      showNotification("Distribution failed: " + error.message, "error");
    }
  }
}
