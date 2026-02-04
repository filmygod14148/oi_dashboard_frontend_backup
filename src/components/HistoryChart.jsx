import React from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

const HistoryChart = ({ historyData }) => {
    // historyData is array of { timestamp, data }
    // We need to extract Total CE OI and Total PE OI from each snapshot.

    const processedData = historyData.map(entry => {
        const records = entry.data?.records || {};
        // Calculate Total OI if not provided directly
        // NSE 'option-chain-indices' usually provides summary if we look for it, 
        // but calculating from 'data' array is safer.
        // entry.data.filtered.CE.totOI or similar might exist.

        // Let's assume standard structure or calculate sum.
        // For now, let's try to find sum in 'filtered' object which nse usually returns
        const ceTotal = entry.data?.filtered?.CE?.totOI || 0;
        const peTotal = entry.data?.filtered?.PE?.totOI || 0;

        return {
            time: new Date(entry.timestamp).toLocaleTimeString(),
            ceTotal,
            peTotal,
            pcr: peTotal / (ceTotal || 1) // avoid div by zero
        };
    });

    const chartData = {
        labels: processedData.map(d => d.time),
        datasets: [
            {
                label: 'Total Call OI',
                data: processedData.map(d => d.ceTotal),
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
            },
            {
                label: 'Total Put OI',
                data: processedData.map(d => d.peTotal),
                borderColor: 'rgb(53, 162, 235)',
                backgroundColor: 'rgba(53, 162, 235, 0.5)',
            },
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'OI History (Intraday)',
            },
        },
    };

    return <Line options={options} data={chartData} />;
};

export default HistoryChart;
