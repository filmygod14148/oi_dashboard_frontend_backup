import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SnapshotTable from './SnapshotTable';
import HistoryTable from './HistoryTable';

const Dashboard = () => {
    const [symbol, setSymbol] = useState('NIFTY');
    const [currentData, setCurrentData] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [liveSpotPrice, setLiveSpotPrice] = useState('N/A'); // Live spot price that updates every 5s

    const [refreshInterval] = useState(5000); // 5 seconds
    const [timeLeft, setTimeLeft] = useState(5); // Countdown timer
    const [previousData, setPreviousData] = useState(null); // Store previous fetch for comparison
    const [strikeCount, setStrikeCount] = useState(5); // Default 5 strikes
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }); // Default: Today (Local)
    const [timeFilter, setTimeFilter] = useState('all'); // Default: All Time
    const [currentTime, setCurrentTime] = useState(new Date()); // Clock state
    const [showClock, setShowClock] = useState(true); // Toggle clock
    const [showHistory, setShowHistory] = useState(true); // Toggle OI history


    const fetchData = async (isBackground = false, forceFullFetch = false) => {
        if (!isBackground) setLoading(true);
        try {
            const API_BASE_URL = import.meta.env.VITE_API_URL || '';

            // 1. Fetch only latest
            const latestRes = await axios.get(`${API_BASE_URL}/api/latest?symbol=${symbol}`);
            const latest = latestRes.data;

            if (!latest) {
                if (!isBackground) setLoading(false);
                return;
            }

            // Check if data has changed
            const isNewData = !previousData ||
                (latest._id && previousData._id !== latest._id) ||
                (latest.timestamp !== previousData.timestamp);

            if (isNewData || forceFullFetch) {
                setCurrentData(latest);
                const updateDate = new Date(latest.timestamp);
                setLastUpdated(!isNaN(updateDate.getTime()) ? updateDate.toLocaleTimeString() : 'Invalid Date');
                setPreviousData(latest);

                // 2. Fetch history ONLY if we don't have it yet, or if it's a manual refresh, or forced full fetch
                if (history.length === 0 || !isBackground || forceFullFetch) {
                    console.log(`Fetching history (forceFullFetch: ${forceFullFetch})...`);

                    // Build query params with date/time filters
                    let historyParams = `symbol=${symbol}`;

                    if (!forceFullFetch) {
                        historyParams += '&limit=25&trim=true';
                    } else {
                        // Explicitly request a large limit to override backend defaults
                        historyParams += '&limit=5000';
                    }

                    // Add date filter if a specific date is selected
                    if (selectedDate) {
                        historyParams += `&startDate=${selectedDate}&endDate=${selectedDate}`;
                    }

                    // Add time filter (convert to hours)
                    if (timeFilter && timeFilter !== 'all') {
                        const hoursMap = { '1h': 1, '3h': 3, '6h': 6 };
                        const hours = hoursMap[timeFilter];
                        if (hours) {
                            historyParams += `&hours=${hours}`;
                        }
                    }

                    const histRes = await axios.get(`${API_BASE_URL}/api/history?${historyParams}`);
                    if (histRes.data && Array.isArray(histRes.data)) {
                        setHistory(histRes.data);
                    }
                } else {
                    // Incremental update: Append the latest data point to history
                    // but first check if it's already there to avoid duplicates
                    setHistory(prev => {
                        const exists = prev.some(h => h._id === latest._id || h.timestamp === latest.timestamp);
                        if (exists) return prev;

                        const newHistory = [...prev, latest];
                        // Keep a reasonable window of history (e.g., last 5000 points - effective for full day)
                        return newHistory.slice(-5000);
                    });
                }
            } else {
                console.log('No changes detected');
            }
        } catch (error) {
            console.error('Error fetching data', error);
        }
        if (!isBackground) setLoading(false);
    };

    // Initial fetch on mount or symbol change
    useEffect(() => {
        setHistory([]); // Clear history on symbol change
        setPreviousData(null); // Reset previous data to force fetch

        // Initial fetch (fast, restricted to 25 records)
        fetchData(false, false);

        // Delayed fetch (full data after 10 seconds)
        const timer = setTimeout(() => {
            console.log('Fetching full data after 10s delay...');
            fetchData(false, true);
        }, 10000);

        return () => clearTimeout(timer);
    }, [symbol]);

    // Fetch data when filters change
    useEffect(() => {
        setHistory([]); // Clear history to trigger "initial fetch" logic with new params
        setPreviousData(null);
        fetchData(false);
    }, [selectedDate, timeFilter]);

    // Poll every 5 seconds
    // Countdown and Auto-Refresh Effect
    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    fetchData(true);
                    return 5; // Reset to 5 seconds
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [symbol, previousData]);

    // Clock Effect
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Live Spot Price Refresh - Updates every 5 seconds
    useEffect(() => {
        const fetchSpotPrice = async () => {
            try {
                const API_BASE_URL = import.meta.env.VITE_API_URL || '';
                const latestRes = await axios.get(`${API_BASE_URL}/api/latest?symbol=${symbol}`);
                const latest = latestRes.data;
                if (latest?.data?.records?.underlyingValue) {
                    setLiveSpotPrice(latest.data.records.underlyingValue);
                }
            } catch (error) {
                console.error('Error fetching spot price', error);
            }
        };

        // Fetch immediately on mount
        fetchSpotPrice();

        // Then fetch every 5 seconds
        const interval = setInterval(fetchSpotPrice, 5000);

        return () => clearInterval(interval);
    }, [symbol]);

    // Derived values - Always use the latest snapshot for spot price
    const latestSnapshot = history.length > 0 ? history[history.length - 1] : currentData;
    const totalCE = currentData?.data?.filtered?.CE?.totOI || 0;
    const totalPE = currentData?.data?.filtered?.PE?.totOI || 0;
    let pcr = "0.00";
    if (totalCE > 0 && !isNaN(totalPE)) {
        pcr = (totalPE / totalCE).toFixed(2);
    }
    const spotPrice = latestSnapshot?.data?.records?.underlyingValue || 'N/A';

    // Generate last 7 days for dropdown (Local Time Safe)
    const availableDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        // Manual formatting to YYYY-MM-DD using local time
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });


    return (
        <div className="p-4 max-w-[1920px] mx-auto relative bg-[#f8fafc] min-h-screen">
            {/* Floating Time Display */}
            {showClock && (
                <div className="fixed top-4 left-4 bg-black/80 text-white px-3 py-1 rounded shadow-lg z-50 text-sm font-mono tracking-wider border border-gray-600">
                    {currentTime.toLocaleTimeString()}
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">OI Dashboard</h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500 flex flex-col items-end">
                        <span>Updated: {lastUpdated || 'Never'}</span>
                        {currentData?.data?.nseTimestamp && (
                            <span className="text-xs text-blue-600 font-semibold">NSE: {currentData.data.nseTimestamp}</span>
                        )}
                    </span>

                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none bg-white px-3 py-2 rounded border shadow-sm hover:bg-gray-50">
                        <input
                            type="checkbox"
                            checked={showClock}
                            onChange={(e) => setShowClock(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        Clock
                    </label>

                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none bg-white px-3 py-2 rounded border shadow-sm hover:bg-gray-50">
                        <input
                            type="checkbox"
                            checked={showHistory}
                            onChange={(e) => setShowHistory(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        OI History
                    </label>

                    <select
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        className="p-2 border rounded shadow-sm bg-white"
                    >
                        <option value="NIFTY">NIFTY 50</option>
                        <option value="BANKNIFTY">BANKNIFTY</option>
                        <option value="FINNIFTY">FINNIFTY</option>
                    </select>
                    <button
                        onClick={() => fetchData(false, true)}
                        disabled={loading}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                        Fetch All
                    </button>
                    <button
                        onClick={() => { fetchData(); setTimeLeft(5); }}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 min-w-[100px]"
                    >
                        {loading ? 'Refreshing...' : `Refresh (${timeLeft}s)`}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded shadow border-l-4 border-blue-500">
                    <h3 className="text-gray-500 text-sm">Spot Price</h3>
                    <p className="text-2xl font-bold">{liveSpotPrice}</p>
                </div>
                <div className="bg-white p-4 rounded shadow border-l-4 border-green-500">
                    <h3 className="text-gray-500 text-sm">PCR</h3>
                    <p className="text-2xl font-bold">{pcr}</p>
                </div>
                <div className="bg-white p-4 rounded shadow border-l-4 border-red-500">
                    <h3 className="text-gray-500 text-sm">Total CE OI</h3>
                    <p className="text-2xl font-bold text-red-600">{totalCE.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded shadow border-l-4 border-teal-500">
                    <h3 className="text-gray-500 text-sm">Total PE OI</h3>
                    <p className="text-2xl font-bold text-teal-600">{totalPE.toLocaleString()}</p>
                </div>
            </div>

            {/* Dashboard Container - Two Panels */}
            <div className="flex flex-col lg:flex-row gap-6 mt-6">

                {/* Left Panel - Table and Data */}
                <div className="w-full flex flex-col gap-6">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-grow">
                        <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                            <h3 className="font-bold text-lg text-gray-800">Snapshot History</h3>
                            <div className="flex flex-wrap gap-3 items-center">
                                <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                    <label className="text-gray-500 font-medium">Strikes:</label>
                                    <select
                                        className="border-none bg-transparent font-bold text-gray-700 focus:ring-0"
                                        value={strikeCount}
                                        onChange={(e) => setStrikeCount(Number(e.target.value))}
                                    >
                                        <option value={3}>3</option>
                                        <option value={5}>5</option>
                                        <option value={7}>7</option>
                                        <option value={9}>9</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                    <label className="text-gray-500 font-medium">Date:</label>
                                    <select
                                        className="border-none bg-transparent font-bold text-gray-700 focus:ring-0"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                    >
                                        {availableDates.map(date => (
                                            <option key={date} value={date}>{date}</option>
                                        ))}
                                        <option value="">All Time</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                    <label className="text-gray-500 font-medium">Time:</label>
                                    <select
                                        className="border-none bg-transparent font-bold text-gray-700 focus:ring-0"
                                        value={timeFilter}
                                        onChange={(e) => setTimeFilter(e.target.value)}
                                    >
                                        <option value="1h">Last 1 Hour</option>
                                        <option value="3h">Last 3 Hours</option>
                                        <option value="6h">Last 6 Hours</option>
                                        <option value="all">All Time</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        {showHistory && (
                            <div className="flex flex-col gap-6 mb-6">
                                <HistoryTable
                                    historyData={history}
                                    selectedDate={selectedDate}
                                    timeFilter={timeFilter}
                                    strikeCount={strikeCount}
                                />
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <SnapshotTable historyData={history} selectedDate={selectedDate} timeFilter={timeFilter} strikeCount={strikeCount} />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
