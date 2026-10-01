document.addEventListener('DOMContentLoaded', () => {
  // --- Theme Controller ---
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('vlsm_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.textContent = savedTheme === 'dark' ? '☀️ Light' : '🌙 Dark';

  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('vlsm_theme', newTheme);
    themeToggle.textContent = newTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
  });

  // --- Tab Navigation ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // --- Dynamic Subnet Builder Rows ---
  const builderContainer = document.getElementById('subnet-inputs-container');
  const addSubnetBtn = document.getElementById('add-subnet-btn');

  const defaultSubnets = [
    { name: 'LAN_A', hosts: 100 },
    { name: 'LAN_B', hosts: 50 },
    { name: 'LAN_C', hosts: 20 },
    { name: 'WAN_1', hosts: 2 }
  ];

  function renderSubnetInputs(subnets) {
    builderContainer.innerHTML = '';
    subnets.forEach((sub, idx) => {
      const row = document.createElement('div');
      row.className = 'subnet-builder-row';
      row.innerHTML = `
        <input type="text" class="sub-name" value="${sub.name}" placeholder="Subnet Name" />
        <input type="number" class="sub-hosts" value="${sub.hosts}" placeholder="Hosts Needed" min="1" />
        <button class="icon-btn remove-row-btn" data-idx="${idx}" title="Remove Subnet">🗑️</button>
      `;
      builderContainer.appendChild(row);
    });

    document.querySelectorAll('.remove-row-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.idx);
        const currentData = getSubnetInputsData();
        currentData.splice(index, 1);
        renderSubnetInputs(currentData);
      });
    });
  }

  function getSubnetInputsData() {
    const names = document.querySelectorAll('.sub-name');
    const hosts = document.querySelectorAll('.sub-hosts');
    const data = [];
    names.forEach((el, i) => {
      data.push({
        name: el.value.trim() || `Subnet_${i + 1}`,
        hosts: parseInt(hosts[i].value) || 0
      });
    });
    return data;
  }

  addSubnetBtn.addEventListener('click', () => {
    const currentData = getSubnetInputsData();
    currentData.push({ name: `LAN_${String.fromCharCode(65 + currentData.length)}`, hosts: 10 });
    renderSubnetInputs(currentData);
  });

  document.getElementById('reset-calc-btn').addEventListener('click', () => {
    document.getElementById('base-ip').value = '192.168.1.0/24';
    renderSubnetInputs(defaultSubnets);
    document.getElementById('results-wrapper').classList.add('hidden');
  });

  renderSubnetInputs(defaultSubnets);

  // --- IP Conversion Math Helpers ---
  function ipToLong(ip) {
    return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
  }

  function longToIp(long) {
    return [
      (long >>> 24) & 255,
      (long >>> 16) & 255,
      (long >>> 8) & 255,
      long & 255
    ].join('.');
  }

  function getMaskString(cidr) {
    const mask = cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0;
    return longToIp(mask);
  }

  // --- VLSM Calculator Algorithm ---
  let calculatedResults = [];

  document.getElementById('calc-btn').addEventListener('click', () => {
    const baseIpVal = document.getElementById('base-ip').value.trim();
    const parts = baseIpVal.split('/');

    if (parts.length !== 2) {
      alert('Invalid IP/CIDR format. Use format: e.g. 192.168.1.0/24');
      return;
    }

    const baseIpStr = parts[0];
    const baseCidr = parseInt(parts[1]);

    if (isNaN(baseCidr) || baseCidr < 8 || baseCidr > 30) {
      alert('CIDR prefix must be between /8 and /30');
      return;
    }

    const totalNetworkCapacity = Math.pow(2, 32 - baseCidr);
    let currentIpLong = ipToLong(baseIpStr);
    const startNetworkLong = currentIpLong;

    // Get and sort requirements descending (VLSM rule)
    const rawSubnets = getSubnetInputsData().filter(s => s.hosts > 0);
    rawSubnets.sort((a, b) => b.hosts - a.hosts);

    if (rawSubnets.length === 0) {
      alert('Please enter at least one subnet host demand.');
      return;
    }

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    calculatedResults = [];
    let totalAllocatedIps = 0;

    for (let sub of rawSubnets) {
      let hostBits = 1;
      while ((Math.pow(2, hostBits) - 2) < sub.hosts) {
        hostBits++;
      }

      const prefix = 32 - hostBits;
      const blockSize = Math.pow(2, hostBits);

      const netLong = currentIpLong;
      const broadcastLong = netLong + blockSize - 1;
      const firstUsableLong = netLong + 1;
      const lastUsableLong = broadcastLong - 1;

      const record = {
        name: sub.name,
        needed: sub.hosts,
        allocatedCapacity: blockSize - 2,
        prefix: `/${prefix}`,
        netIp: longToIp(netLong),
        usableRange: `${longToIp(firstUsableLong)} - ${longToIp(lastUsableLong)}`,
        broadcastIp: longToIp(broadcastLong)
      };

      calculatedResults.push(record);
      totalAllocatedIps += blockSize;

      tbody.innerHTML += `
        <tr>
          <td><strong>${record.name}</strong></td>
          <td>${record.needed}</td>
          <td><strong>${record.allocatedCapacity}</strong> (${record.prefix})</td>
          <td>${record.netIp}</td>
          <td>${record.usableRange}</td>
          <td>${record.broadcastIp}</td>
        </tr>
      `;

      currentIpLong += blockSize;
    }

    // Update Statistics Bar
    const resultsWrapper = document.getElementById('results-wrapper');
    resultsWrapper.classList.remove('hidden');

    const percentUsed = Math.min(100, Math.round((totalAllocatedIps / totalNetworkCapacity) * 100));
    const progressBar = document.getElementById('allocation-progress-bar');
    progressBar.style.width = `${percentUsed}%`;

    if (totalAllocatedIps > totalNetworkCapacity) {
      progressBar.style.background = 'var(--danger-color)';
    } else {
      progressBar.style.background = 'var(--accent-color)';
    }

    document.getElementById('stat-used').textContent = `${totalAllocatedIps} / ${totalNetworkCapacity} IPs Used`;
    document.getElementById('stat-percent').textContent = `${percentUsed}%`;
    document.getElementById('stat-total').textContent = totalNetworkCapacity;
    document.getElementById('stat-free').textContent = Math.max(0, totalNetworkCapacity - totalAllocatedIps);
  });

  // --- Export Functionalities ---
  document.getElementById('copy-text-btn').addEventListener('click', () => {
    if (calculatedResults.length === 0) return;
    let text = "NAME\tNEEDED\tPREFIX\tNETWORK\tUSABLE RANGE\tBROADCAST\n";
    calculatedResults.forEach(r => {
      text += `${r.name}\t${r.needed}\t${r.prefix}\t${r.netIp}\t${r.usableRange}\t${r.broadcastIp}\n`;
    });
    navigator.clipboard.writeText(text);
    alert('Table copied to clipboard!');
  });

  document.getElementById('download-json-btn').addEventListener('click', () => {
    if (calculatedResults.length === 0) return;
    const blob = new Blob([JSON.stringify(calculatedResults, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vlsm-allocation.json';
    a.click();
  });

  // --- Reference Table Generator ---
  const refTbody = document.getElementById('reference-tbody');
  for (let cidr = 30; cidr >= 8; cidr--) {
    const total = Math.pow(2, 32 - cidr);
    const usable = cidr >= 31 ? 0 : total - 2;
    refTbody.innerHTML += `
      <tr>
        <td>/${cidr}</td>
        <td>${getMaskString(cidr)}</td>
        <td>${total.toLocaleString()}</td>
        <td>${usable.toLocaleString()}</td>
      </tr>
    `;
  }

  // --- Quiz Engine & Progress Tracker ---
  let score = parseInt(localStorage.getItem('vlsm_score') || '0');
  let streak = parseInt(localStorage.getItem('vlsm_streak') || '1');
  
  document.getElementById('score-display').textContent = score;
  document.getElementById('streak-count').textContent = streak;

  const quizQuestions = [
    {
      q: "What prefix length (/CIDR) is required to support 50 host addresses?",
      opts: ["/27", "/26", "/25", "/24"],
      ans: 1,
      exp: "50 hosts require 64 total addresses ($2^6$). $32 - 6 = 26$. So prefix is /26."
    },
    {
      q: "How many usable host IPs does a /29 subnet mask provide?",
      opts: ["6", "8", "14", "30"],
      ans: 0,
      exp: "A /29 subnet gives 8 total IPs ($2^3$). Subtracting network and broadcast leaves 6 usable host addresses."
    },
    {
      q: "In VLSM, why must subnet host requirements be ordered from largest to smallest?",
      opts: [
        "To maximize download speeds",
        "To align network boundaries cleanly and prevent address overlap",
        "It is a soft preference, not required",
        "To reserve the lowest IPs for routers"
      ],
      ans: 1,
      exp: "Sorting largest to smallest ensures large block allocations align cleanly on binary boundaries without fragmentation."
    }
  ];

  let currentQIdx = 0;

  function loadQuestion(idx) {
    const q = quizQuestions[idx];
    document.getElementById('quiz-question').textContent = `Q${idx + 1}: ${q.q}`;
    const optsContainer = document.getElementById('quiz-options');
    optsContainer.innerHTML = '';
    
    const feedbackBox = document.getElementById('quiz-feedback');
    feedbackBox.className = 'feedback-box hidden';

    q.opts.forEach((optText, oIdx) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt-btn';
      btn.textContent = optText;
      btn.addEventListener('click', () => checkQuizAnswer(oIdx));
      optsContainer.appendChild(btn);
    });

    document.getElementById('next-question-btn').classList.add('hidden');
  }

  function checkQuizAnswer(selectedIdx) {
    const q = quizQuestions[currentQIdx];
    const feedbackBox = document.getElementById('quiz-feedback');
    feedbackBox.classList.remove('hidden');

    if (selectedIdx === q.ans) {
      feedbackBox.className = 'feedback-box correct';
      feedbackBox.textContent = `Correct! ${q.exp}`;
      score += 10;
      localStorage.setItem('vlsm_score', score);
      document.getElementById('score-display').textContent = score;
    } else {
      feedbackBox.className = 'feedback-box incorrect';
      feedbackBox.textContent = `Incorrect. ${q.exp}`;
    }

    document.getElementById('next-question-btn').classList.remove('hidden');
  }

  document.getElementById('next-question-btn').addEventListener('click', () => {
    currentQIdx = (currentQIdx + 1) % quizQuestions.length;
    loadQuestion(currentQIdx);
  });

  document.getElementById('reset-score-btn').addEventListener('click', () => {
    score = 0;
    localStorage.setItem('vlsm_score', '0');
    document.getElementById('score-display').textContent = score;
  });

  loadQuestion(0);
});