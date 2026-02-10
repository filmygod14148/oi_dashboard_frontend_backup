import React, { useState } from 'react';

const SnapshotTable = ({ historyData, selectedDate, timeFilter, strikeCount }) => {
    // State for column visibility
    const [visibleColumns, setVisibleColumns] = useState({
        oi: true,
        volume: true,
        iv: true,
        ltp: true,
        oiValue: false
    });

    const LOT_SIZE = Number(import.meta.env.VITE_LOT_SIZE) || 65;

    // historyData is sorted oldest to newest from backend
    // User wants Newest at TOP (Reverse Chronological)
    let historyToDisplay = [...historyData].reverse();

    // Date filter - filter by specific date
    if (selectedDate) {
        // Create start and end of the selected day in LOCAL time
        // selectedDate is "YYYY-MM-DD"
        const [year, month, day] = selectedDate.split('-').map(Number);

        // Month in Date constructor is 0-indexed (Jan=0, Feb=1, etc.)
        // But our string comes from human readable "01" = Jan. So we need to subtract 1.
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59);

        historyToDisplay = historyToDisplay.filter(snapshot => {
            const snapshotTime = new Date(snapshot.timestamp);
            return snapshotTime >= startOfDay && snapshotTime <= endOfDay;
        });
    }

    // Time filter (works in combination with date filter)
    // ONLY apply relatively-timed filters (1h, 3h...) if we are looking at TODAY or All Time.
    // If user selected a PAST date, "Last 1 Hour" makes no sense (it would show nothing).
    if (timeFilter && timeFilter !== 'all') {
        const now = new Date(); // Current local time
        const todayYear = now.getFullYear();
        const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
        const todayDay = String(now.getDate()).padStart(2, '0');
        // Match the format used in Dashboard.jsx (YYYY-MM-DD)
        const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

        // If selectedDate is set and it is NOT today, ignore time filter
        const isPastDate = selectedDate && selectedDate !== todayStr;

        if (!isPastDate) {
            const hoursMap = { '1h': 1, '3h': 3, '6h': 6 };
            const hours = hoursMap[timeFilter] || 24;
            const cutoffTime = new Date(now.getTime() - (hours * 60 * 60 * 1000));

            historyToDisplay = historyToDisplay.filter(snapshot => {
                const snapshotTime = new Date(snapshot.timestamp);
                return snapshotTime >= cutoffTime;
            });
        }
    }

    const formatNumber = (val) => (val || 0).toLocaleString();

    // Helper to find closest strike
    const findClosestStrike = (price, step = 50) => {
        return Math.round(price / step) * step;
    };

    const downloadExcel = () => {
        const rows = [];
        // Header matching the UI display
        rows.push([
            'date',
            'Timestamp',
            'NSE Time',
            'Spot Price',
            'Strike Price',
            'CE OI',
            'CE OI Change',
            'CE OI Value',
            'CE Volume',
            'CE Vol Change',
            'CE IV',
            'CE LTP',
            'PE LTP',
            'PE IV',
            'PE Volume',
            'PE Vol Change',
            'PE OI Value',
            'PE OI',
            'PE OI Change'
        ]);

        // Integrate over the filtered/displayed data to match user view
        historyToDisplay.forEach((snapshot, index) => {
            const timestamp = new Date(snapshot.timestamp).toLocaleString();
            const nseTime = snapshot.data?.nseTimestamp || '';
            const spot = snapshot.data?.records?.underlyingValue || 0;
            const records = snapshot.data?.records?.data || [];

            // Calculate ATM and relevant strikes (Same logic as UI)
            // Calculate ATM and relevant strikes (Same logic as UI)
            const atmStrike = findClosestStrike(spot, 50);

            // Generate strikes dynamic based on strikeCount
            const range = (strikeCount - 1) / 2;
            const strikesToShow = [];
            for (let i = -range; i <= range; i++) {
                strikesToShow.push(atmStrike + (i * 50));
            }

            // Get previous snapshot for dynamic diff calculation
            const prevSnapshot = historyToDisplay[index + 1];

            strikesToShow.forEach(strike => {
                // Find data for this specific strike
                const r = records.find(item => item.strikePrice === strike);
                const prevRecord = prevSnapshot?.data?.records?.data?.find(item => item.strikePrice === strike);

                if (r) {
                    // CE Data
                    const currCE = r.CE?.openInterest || 0;
                    const prevCE = prevRecord?.CE?.openInterest || 0;
                    let diffCE = 0;
                    if (prevSnapshot) diffCE = currCE - prevCE;
                    else if (r.CE?.diffOpenInterest !== undefined) diffCE = r.CE.diffOpenInterest;

                    const currCEVol = r.CE?.totalTradedVolume || 0;
                    const prevCEVol = prevRecord?.CE?.totalTradedVolume || 0;
                    let diffCEVol = 0;
                    if (prevSnapshot) diffCEVol = currCEVol - prevCEVol;
                    else if (r.CE?.diffTotalTradedVolume !== undefined) diffCEVol = r.CE.diffTotalTradedVolume;

                    // PE Data
                    const currPE = r.PE?.openInterest || 0;
                    const prevPE = prevRecord?.PE?.openInterest || 0;
                    let diffPE = 0;
                    if (prevSnapshot) diffPE = currPE - prevPE;
                    else if (r.PE?.diffOpenInterest !== undefined) diffPE = r.PE.diffOpenInterest;

                    const currPEVol = r.PE?.totalTradedVolume || 0;
                    const prevPEVol = prevRecord?.PE?.totalTradedVolume || 0;
                    let diffPEVol = 0;
                    if (prevSnapshot) diffPEVol = currPEVol - prevPEVol;
                    else if (r.PE?.diffTotalTradedVolume !== undefined) diffPEVol = r.PE.diffTotalTradedVolume;

                    rows.push([
                        timestamp,
                        nseTime,
                        spot,
                        strike,
                        currCE,
                        diffCE,
                        currCE * LOT_SIZE,
                        currCEVol,
                        diffCEVol,
                        r.CE?.impliedVolatility || 0,
                        r.CE?.lastPrice || 0,
                        r.PE?.lastPrice || 0,
                        r.PE?.impliedVolatility || 0,
                        currPEVol,
                        diffPEVol,
                        currPE * LOT_SIZE,
                        currPE,
                        diffPE
                    ]);
                }
            });
        });

        const csvContent = "data:text/csv;charset=utf-8,"
            + rows.map(e => e.join(",")).join("\n");

        const dateStr = selectedDate || new Date().toISOString().slice(0, 10);
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `oi_history_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Calculate Grid Template Columns dynamically
    // Original: 1.2fr 1fr 0.8fr 80px 0.8fr 1fr 1.2fr
    const getGridTemplate = () => {
        let cols = [];
        if (visibleColumns.oi) cols.push('1.2fr');
        if (visibleColumns.oiValue) cols.push('1.2fr');
        if (visibleColumns.volume) cols.push('1fr');
        if (visibleColumns.iv) cols.push('0.8fr');
        if (visibleColumns.ltp) cols.push('0.8fr');

        cols.push('80px'); // Strike

        if (visibleColumns.ltp) cols.push('0.8fr');
        if (visibleColumns.iv) cols.push('0.8fr');
        if (visibleColumns.volume) cols.push('1fr');
        if (visibleColumns.oiValue) cols.push('1.2fr');
        if (visibleColumns.oi) cols.push('1.2fr');

        return cols.join(' ');
    };

    const gridStyle = { gridTemplateColumns: getGridTemplate() };

    // DEDUPLICATION LOGIC: 
    // Filter out snapshots that have NO visible OI change relative to the previous *visible* snapshot.
    // We process chronologically (Oldest -> Newest) to build the chain of "kept" snapshots.
    let finalHistory = [];
    if (historyToDisplay.length > 0) {
        // historyToDisplay is Newest -> Oldest. Reverse to process chronologically.
        const chronological = [...historyToDisplay].reverse();

        chronological.forEach((currSnapshot) => {
            if (finalHistory.length === 0) {
                // Always keep the oldest available snapshot as baseline
                finalHistory.push(currSnapshot);
                return;
            }

            const prevSnapshot = finalHistory[finalHistory.length - 1];

            // Check if there is ANY visible OI change in the target strikes
            const spotPrice = currSnapshot.data?.records?.underlyingValue || 0;
            const atmStrike = findClosestStrike(spotPrice, 50);

            // Dynamic check range (using current strikeCount)
            const range = (strikeCount - 1) / 2;
            const strikesToCheck = [];
            for (let i = -range; i <= range; i++) {
                strikesToCheck.push(atmStrike + (i * 50));
            }

            let hasOIChange = false;

            for (const strike of strikesToCheck) {
                const currRecord = currSnapshot.data?.records?.data?.find(r => r.strikePrice === strike);
                const prevRecord = prevSnapshot.data?.records?.data?.find(r => r.strikePrice === strike);

                const currCE = currRecord?.CE?.openInterest || 0;
                const prevCE = prevRecord?.CE?.openInterest || 0;
                if (currCE !== prevCE) {
                    hasOIChange = true;
                    break;
                }

                const currPE = currRecord?.PE?.openInterest || 0;
                const prevPE = prevRecord?.PE?.openInterest || 0;
                if (currPE !== prevPE) {
                    hasOIChange = true;
                    break;
                }
            }

            if (hasOIChange) {
                finalHistory.push(currSnapshot);
            }
        });

        // Reverse back to Newest -> Oldest for display
        finalHistory.reverse();
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Control Bar: Filters and Export */}
            <div className="flex flex-wrap justify-between items-center mb-2 gap-4 bg-gray-50 p-2 rounded border">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-gray-700">Show Columns:</span>
                    <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={visibleColumns.oi}
                            onChange={(e) => setVisibleColumns({ ...visibleColumns, oi: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        OI
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={visibleColumns.oiValue}
                            onChange={(e) => setVisibleColumns({ ...visibleColumns, oiValue: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        ZERODHA OI
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={visibleColumns.volume}
                            onChange={(e) => setVisibleColumns({ ...visibleColumns, volume: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        Volume
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={visibleColumns.iv}
                            onChange={(e) => setVisibleColumns({ ...visibleColumns, iv: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        IV
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={visibleColumns.ltp}
                            onChange={(e) => setVisibleColumns({ ...visibleColumns, ltp: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        LTP
                    </label>
                </div>



                <button
                    onClick={downloadExcel}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors shadow-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export to Excel
                </button>
            </div>

            {finalHistory.map((snapshot, index) => {
                let timestamp = 'Unknown Time';
                try {
                    const dateObj = new Date(snapshot.timestamp);
                    if (!isNaN(dateObj.getTime())) {
                        timestamp = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    }
                } catch (e) {
                    console.error('Error formatting time in row', e);
                }
                const spotPrice = snapshot.data?.records?.underlyingValue || 0;

                // Determine ATM
                const atmStrike = findClosestStrike(spotPrice, 50);

                // Dynamic strikes
                const range = (strikeCount - 1) / 2;
                const strikesToShow = [];
                for (let i = -range; i <= range; i++) {
                    strikesToShow.push(atmStrike + (i * 50));
                }

                // Previous snapshot is the one OLDER than the current one in the FILTRERED list
                const prevSnapshot = finalHistory[index + 1];

                // Find data for these strikes
                const relevantData = strikesToShow.map(strike => {
                    const record = snapshot.data?.records?.data?.find(r => r.strikePrice === strike);
                    const prevRecord = prevSnapshot?.data?.records?.data?.find(r => r.strikePrice === strike);

                    const currCE = record?.CE?.openInterest || 0;
                    const prevCE = prevRecord?.CE?.openInterest || 0;
                    // Calculate difference on the fly based on previous snapshot in the list
                    // User requested simple "Current - Previous" logic to avoid 0s from backend
                    let diffCE = 0;
                    if (prevSnapshot) {
                        diffCE = currCE - prevCE;
                    } else if (record?.CE?.diffOpenInterest !== undefined) {
                        diffCE = record.CE.diffOpenInterest;
                    }

                    const currCEVol = record?.CE?.totalTradedVolume || 0;
                    const prevCEVol = prevRecord?.CE?.totalTradedVolume || 0;
                    let diffCEVol = 0;
                    if (prevSnapshot) {
                        diffCEVol = currCEVol - prevCEVol;
                    } else if (record?.CE?.diffTotalTradedVolume !== undefined) {
                        diffCEVol = record.CE.diffTotalTradedVolume;
                    }

                    const currPE = record?.PE?.openInterest || 0;
                    const prevPE = prevRecord?.PE?.openInterest || 0;
                    let diffPE = 0;
                    if (prevSnapshot) {
                        diffPE = currPE - prevPE;
                    } else if (record?.PE?.diffOpenInterest !== undefined) {
                        diffPE = record.PE.diffOpenInterest;
                    }

                    const currPEVol = record?.PE?.totalTradedVolume || 0;
                    const prevPEVol = prevRecord?.PE?.totalTradedVolume || 0;
                    let diffPEVol = 0;
                    if (prevSnapshot) {
                        diffPEVol = currPEVol - prevPEVol;
                    } else if (record?.PE?.diffTotalTradedVolume !== undefined) {
                        diffPEVol = record.PE.diffTotalTradedVolume;
                    }

                    return {
                        strike,
                        CE: record?.CE || {},
                        PE: record?.PE || {},
                        diffCE,
                        diffPE,
                        diffCEVol,
                        diffPEVol,
                        // Show diff if we have a saved diff OR we have a previous snapshot to calc from
                        hasPrev: !!prevSnapshot || (record?.CE?.diffOpenInterest !== undefined)
                    };
                });

                // Find the maximum OI value across ALL strikes (both Call and Put)
                const oiValues = (relevantData || []).map(r => Math.max(r.CE?.openInterest || 0, r.PE?.openInterest || 0));
                const maxOI = oiValues.length > 0 ? Math.max(...oiValues) : 0;
                // Add 5% buffer and use as 100% scale
                const totalScale = Math.max(maxOI * 1.05, 1);

                // Calculate Totals for this snapshot
                const totalCE = relevantData.reduce((acc, row) => acc + (row.CE.openInterest || 0), 0);
                const totalPE = relevantData.reduce((acc, row) => acc + (row.PE.openInterest || 0), 0);
                const totalCEDiff = relevantData.reduce((acc, row) => acc + row.diffCE, 0);
                const totalPEDiff = relevantData.reduce((acc, row) => acc + row.diffPE, 0);

                const totalCEVol = relevantData.reduce((acc, row) => acc + (row.CE.totalTradedVolume || 0), 0);
                const totalPEVol = relevantData.reduce((acc, row) => acc + (row.PE.totalTradedVolume || 0), 0);
                const totalCEDiffVol = relevantData.reduce((acc, row) => acc + row.diffCEVol, 0);
                const totalPEDiffVol = relevantData.reduce((acc, row) => acc + row.diffPEVol, 0);

                // Weighted Average IV Calculation
                let totalCEIVProduct = 0;
                let totalCEIVWeight = 0;
                let totalPEIVProduct = 0;
                let totalPEIVWeight = 0;

                relevantData.forEach(row => {
                    if (row.CE.impliedVolatility && row.CE.openInterest) {
                        totalCEIVProduct += row.CE.impliedVolatility * row.CE.openInterest;
                        totalCEIVWeight += row.CE.openInterest;
                    }
                    if (row.PE.impliedVolatility && row.PE.openInterest) {
                        totalPEIVProduct += row.PE.impliedVolatility * row.PE.openInterest;
                        totalPEIVWeight += row.PE.openInterest;
                    }
                });

                const avgCEIV = totalCEIVWeight > 0 ? (totalCEIVProduct / totalCEIVWeight).toFixed(2) : 0;
                const avgPEIV = totalPEIVWeight > 0 ? (totalPEIVProduct / totalPEIVWeight).toFixed(2) : 0;

                const totalCombinedOI = totalCE + totalPE;

                return (
                    <div key={index} className="bg-white border rounded-lg shadow-sm overflow-hidden text-sm">
                        <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                            <span className="font-bold text-gray-700">
                                {timestamp}
                                {snapshot.data?.nseTimestamp && <span className="text-xs font-normal text-blue-600 ml-2">(NSE: {snapshot.data.nseTimestamp})</span>}
                            </span>
                            <span className="text-gray-500">Spot: <span className="font-mono text-black font-semibold">{spotPrice}</span></span>
                        </div>

                        <div className="grid text-center bg-gray-100 font-semibold text-xs py-2 border-b items-center gap-0" style={gridStyle}>
                            {visibleColumns.oi && <div className="text-gray-600">OI</div>}
                            {visibleColumns.oiValue && <div className="text-gray-600">Call OI Val</div>}
                            {visibleColumns.volume && <div className="text-gray-600">Vol</div>}
                            {visibleColumns.iv && <div className="text-gray-600">IV</div>}
                            {visibleColumns.ltp && <div className="text-gray-600">Call LTP</div>}

                            <div className="text-gray-800">Strike</div>

                            {visibleColumns.ltp && <div className="text-gray-600">Put LTP</div>}
                            {visibleColumns.iv && <div className="text-gray-600">IV</div>}
                            {visibleColumns.volume && <div className="text-gray-600">Vol</div>}
                            {visibleColumns.oiValue && <div className="text-gray-600">Put OI Val</div>}
                            {visibleColumns.oi && <div className="text-gray-600">OI</div>}
                        </div>

                        {relevantData.map((row, rIndex) => (
                            <div key={rIndex} className={`border-b last:border-0 ${row.strike === atmStrike ? 'bg-yellow-50' : 'bg-white'}`}>
                                {/* Main Row Grid */}
                                <div className="grid text-center py-2 items-center gap-0" style={gridStyle}>
                                    {/* CE OI */}
                                    {visibleColumns.oi && (
                                        <div className="flex justify-center items-center gap-2">
                                            {row.hasPrev && (
                                                <div className="flex flex-col items-end">
                                                    <span className={`text-[10px] font-semibold ${row.diffCE >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {row.diffCE > 0 ? '+' : ''}{formatNumber(row.diffCE)}
                                                    </span>
                                                    <span className={`text-[9px] ${row.diffCE >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        ({((row.CE.openInterest - row.diffCE) === 0 ? 0 : (row.diffCE / (row.CE.openInterest - row.diffCE)) * 100).toFixed(1)}%)
                                                    </span>
                                                </div>
                                            )}
                                            <span className="font-bold text-gray-800">{formatNumber(row.CE.openInterest || 0)}</span>
                                        </div>
                                    )}

                                    {/* CE OI Value */}
                                    {visibleColumns.oiValue && (
                                        <div className="flex justify-center items-center gap-2">
                                            {row.hasPrev && (
                                                <div className="flex flex-col items-end">
                                                    <span className={`text-[10px] font-semibold ${row.diffCE >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {row.diffCE > 0 ? '+' : ''}{((row.diffCE * LOT_SIZE) / 100000).toFixed(2)}
                                                    </span>
                                                    <span className={`text-[9px] ${row.diffCE >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        ({((row.CE.openInterest - row.diffCE) === 0 ? 0 : (row.diffCE / (row.CE.openInterest - row.diffCE)) * 100).toFixed(1)}%)
                                                    </span>
                                                </div>
                                            )}
                                            <div className="text-xs font-bold text-black">
                                                {((row.CE.openInterest * LOT_SIZE) / 100000).toFixed(2)}
                                            </div>
                                        </div>
                                    )}

                                    {/* CE Volume */}
                                    {
                                        visibleColumns.volume && (
                                            <div className="flex flex-col justify-center items-center">
                                                <div className="text-xs text-gray-500">{formatNumber(row.CE.totalTradedVolume || 0)}</div>
                                                {row.hasPrev && row.diffCEVol !== 0 && (
                                                    <span className={`text-[9px] ${row.diffCEVol >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {row.diffCEVol > 0 ? '+' : ''}{formatNumber(row.diffCEVol)}
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    }

                                    {/* CE IV */}
                                    {
                                        visibleColumns.iv && (
                                            <div className="text-gray-600 text-xs">{(row.CE.impliedVolatility !== undefined && row.CE.impliedVolatility !== null) ? row.CE.impliedVolatility : '-'}</div>
                                        )
                                    }

                                    {/* CE LTP */}
                                    {
                                        visibleColumns.ltp && (
                                            <div className="font-mono">{row.CE.lastPrice || '-'}</div>
                                        )
                                    }

                                    {/* Strike */}
                                    <div className="flex items-center justify-center font-bold bg-gray-200 rounded mx-1 text-gray-800 text-xs py-1">
                                        {row.strike}
                                    </div>

                                    {/* PE LTP */}
                                    {
                                        visibleColumns.ltp && (
                                            <div className="font-mono">{row.PE.lastPrice || '-'}</div>
                                        )
                                    }

                                    {/* PE IV */}
                                    {
                                        visibleColumns.iv && (
                                            <div className="text-gray-600 text-xs">{(row.PE.impliedVolatility !== undefined && row.PE.impliedVolatility !== null) ? row.PE.impliedVolatility : '-'}</div>
                                        )
                                    }

                                    {/* PE Volume */}
                                    {
                                        visibleColumns.volume && (
                                            <div className="flex flex-col justify-center items-center">
                                                <div className="text-xs text-gray-500">{formatNumber(row.PE.totalTradedVolume || 0)}</div>
                                                {row.hasPrev && row.diffPEVol !== 0 && (
                                                    <span className={`text-[9px] ${row.diffPEVol >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {row.diffPEVol > 0 ? '+' : ''}{formatNumber(row.diffPEVol)}
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    }

                                    {/* PE OI Value */}
                                    {
                                        visibleColumns.oiValue && (
                                            <div className="flex justify-center items-center gap-2">
                                                <div className="text-xs font-bold text-black">
                                                    {((row.PE.openInterest * LOT_SIZE) / 100000).toFixed(2)}
                                                </div>
                                                {row.hasPrev && (
                                                    <div className="flex flex-col items-start">
                                                        <span className={`text-[10px] font-semibold ${row.diffPE >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {row.diffPE > 0 ? '+' : ''}{((row.diffPE * LOT_SIZE) / 100000).toFixed(2)}
                                                        </span>
                                                        <span className={`text-[9px] ${row.diffPE >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            ({((row.PE.openInterest - row.diffPE) === 0 ? 0 : (row.diffPE / (row.PE.openInterest - row.diffPE)) * 100).toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    }

                                    {/* PE OI */}
                                    {
                                        visibleColumns.oi && (
                                            <div className="flex justify-center items-center gap-2">
                                                <span className="font-bold text-gray-800">{formatNumber(row.PE.openInterest || 0)}</span>
                                                {row.hasPrev && (
                                                    <div className="flex flex-col items-start">
                                                        <span className={`text-[10px] font-semibold ${row.diffPE >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {row.diffPE > 0 ? '+' : ''}{formatNumber(row.diffPE)}
                                                        </span>
                                                        <span className={`text-[9px] ${row.diffPE >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            ({((row.PE.openInterest - row.diffPE) === 0 ? 0 : (row.diffPE / (row.PE.openInterest - row.diffPE)) * 100).toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    }
                                </div>

                                {/* Progress Bar Centered at Strike - Red (Call) on Left, Green (Put) on Right */}
                                <div className="w-full h-2 flex items-stretch px-2 pb-1 gap-0">
                                    {/* Left side - Red bar for Call OI */}
                                    <div className="flex-1 bg-gray-200 flex justify-end items-stretch overflow-hidden rounded-l">
                                        <div
                                            className="h-full cursor-pointer hover:opacity-80 transition-opacity rounded-l"
                                            style={{
                                                width: `${totalScale > 0 ? (row.CE.openInterest / totalScale) * 100 : 0}%`,
                                                background: 'linear-gradient(to right, #ef4444, #fca5a5)'
                                            }}
                                            title={`Call OI: ${formatNumber(row.CE.openInterest || 0)} (${totalScale > 0 ? ((row.CE.openInterest / totalScale) * 100).toFixed(2) : 0}%)`}
                                        ></div>
                                    </div>

                                    {/* Center - Strike indicator */}
                                    <div className="w-1 bg-gray-400"></div>

                                    {/* Right side - Green bar for Put OI */}
                                    <div className="flex-1 bg-gray-200 flex justify-start items-stretch overflow-hidden rounded-r">
                                        <div
                                            className="h-full cursor-pointer hover:opacity-80 transition-opacity rounded-r"
                                            style={{
                                                width: `${totalScale > 0 ? (row.PE.openInterest / totalScale) * 100 : 0}%`,
                                                background: 'linear-gradient(to right, #86efac, #22c55e)'
                                            }}
                                            title={`Put OI: ${formatNumber(row.PE.openInterest || 0)} (${totalScale > 0 ? ((row.PE.openInterest / totalScale) * 100).toFixed(2) : 0}%)`}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* TOTALS ROW */}
                        <div className="bg-blue-50 border-t-2 border-blue-200">
                            <div className="grid text-center py-2 items-center gap-0 font-bold" style={gridStyle}>
                                {/* CE OI Total */}
                                {visibleColumns.oi && (
                                    <div className="flex justify-center items-center gap-2">
                                        <div className="flex flex-col items-end">
                                            <span className={`text-[10px] ${totalCEDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {totalCEDiff > 0 ? '+' : ''}{formatNumber(totalCEDiff)}
                                            </span>
                                        </div>
                                        <span className="text-gray-900">{formatNumber(totalCE)}</span>
                                    </div>
                                )}

                                {/* CE OI Value Total */}
                                {visibleColumns.oiValue && (
                                    <div className="flex justify-center items-center gap-2">
                                        <div className="flex flex-col items-end">
                                            <span className={`text-[10px] ${totalCEDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {totalCEDiff > 0 ? '+' : ''}{((totalCEDiff * LOT_SIZE) / 100000).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-black">
                                            {((totalCE * LOT_SIZE) / 100000).toFixed(2)}
                                        </div>
                                    </div>
                                )}

                                {/* CE Vol Total */}
                                {visibleColumns.volume && (
                                    <div className="flex flex-col justify-center items-center">
                                        <div className="text-xs text-gray-700">{formatNumber(totalCEVol)}</div>
                                        {totalCEDiffVol !== 0 && (
                                            <span className={`text-[9px] ${totalCEDiffVol >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {totalCEDiffVol > 0 ? '+' : ''}{formatNumber(totalCEDiffVol)}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {visibleColumns.iv && <div className="text-xs text-gray-700">{avgCEIV}</div>}
                                {visibleColumns.ltp && <div></div>}

                                <div className="text-blue-800 bg-blue-200 rounded px-2 py-1 mx-1 text-xs">TOTAL</div>

                                {visibleColumns.ltp && <div></div>}
                                {visibleColumns.iv && <div className="text-xs text-gray-700">{avgPEIV}</div>}

                                {/* PE Vol Total */}
                                {visibleColumns.volume && (
                                    <div className="flex flex-col justify-center items-center">
                                        <div className="text-xs text-gray-700">{formatNumber(totalPEVol)}</div>
                                        {totalPEDiffVol !== 0 && (
                                            <span className={`text-[9px] ${totalPEDiffVol >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {totalPEDiffVol > 0 ? '+' : ''}{formatNumber(totalPEDiffVol)}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* PE OI Value Total */}
                                {visibleColumns.oiValue && (
                                    <div className="flex justify-center items-center gap-2">
                                        <div className="text-xs text-black">
                                            {((totalPE * LOT_SIZE) / 100000).toFixed(2)}
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className={`text-[10px] ${totalPEDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {totalPEDiff > 0 ? '+' : ''}{((totalPEDiff * LOT_SIZE) / 100000).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* PE OI Total */}
                                {visibleColumns.oi && (
                                    <div className="flex justify-center items-center gap-2">
                                        <span className="text-gray-900">{formatNumber(totalPE)}</span>
                                        <div className="flex flex-col items-start">
                                            <span className={`text-[10px] ${totalPEDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {totalPEDiff > 0 ? '+' : ''}{formatNumber(totalPEDiff)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Total Progress Bar (Call vs Put Ratio) */}
                            <div className="w-full h-4 flex items-stretch px-2 pb-2 gap-0">
                                {/* Left side - Red bar for Total Call OI % */}
                                <div className="flex-1 bg-gray-200 flex justify-end items-stretch overflow-hidden rounded-l-full relative group">
                                    <div
                                        className="h-full bg-gradient-to-r from-red-500 to-red-300 relative rounded-l-full"
                                        style={{ width: `${totalCombinedOI > 0 ? (totalCE / totalCombinedOI) * 100 : 0}%` }}
                                    >
                                        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-bold drop-shadow-md">
                                            {totalCombinedOI > 0 ? ((totalCE / totalCombinedOI) * 100).toFixed(1) : 0}%
                                        </span>
                                    </div>
                                </div>

                                {/* Center Divider */}
                                <div className="w-1 bg-blue-400 z-10"></div>

                                {/* Right side - Green bar for Total Put OI % */}
                                <div className="flex-1 bg-gray-200 flex justify-start items-stretch overflow-hidden rounded-r-full relative group">
                                    <div
                                        className="h-full bg-gradient-to-r from-green-300 to-green-500 relative rounded-r-full"
                                        style={{ width: `${totalCombinedOI > 0 ? (totalPE / totalCombinedOI) * 100 : 0}%` }}
                                    >
                                        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-bold drop-shadow-md">
                                            {totalCombinedOI > 0 ? ((totalPE / totalCombinedOI) * 100).toFixed(1) : 0}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default SnapshotTable;
