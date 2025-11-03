
        // Hardcoded configuration from your script
        const CONFIG = {
            zoom: {
                clientId: 'u85SFHXvTDuhEPSHvEEdYA',
                clientSecret: 'c05ZLKz3VV8zFP83Q6GxBKAmqZubJ4PP',
                accountId: '7f541wViSUi-Gc7WIzPJHA'
            },
            supabase: {
                url: 'https://ewutthaqmnvdxhcunbci.supabase.co',
                key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dXR0aGFxbW52ZHhoY3VuYmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNDgyNjgsImV4cCI6MjA3MjcyNDI2OH0.dMQPQPJIZVnsDde2C09ZniR52eEn7zAVgpOBiMA_Qs8',
                table: 'calls'
            }
        };

        const MAX_LOOKBACK_DAYS = 90; // Only fetch calls from last 30 days max

        export async function runAnalysis(data, latestDate = null) {
            try {
                const usersMap = await getZoomUsers();
                const bookings = await filterDataFromSupabase(data);
                const callLogs = await getZoomCallLogs(bookings, latestDate);
                const analysis = analyzeResponseTimes(bookings, callLogs, usersMap);

                const callTimeMap = {};

                analysis.forEach(result => {
                    callTimeMap[result.callId] = {
                    responseTimeMinutes: result.responseTimeMinutes,
                    firstCallDate: result.firstCallDate,
                    called: result.called 
                    }
                });

                return callTimeMap;
                
            } catch (error) {
                console.error('Analysis error:', error);
            }
        }

        async function makeZoomApiCall(url, method = 'GET', body = null) {
    const response = await fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

        async function getZoomUsers() {
            try {
                const data = await makeZoomApiCall('https://zoom-api.floral-rain-cd3c.workers.dev/zoom-users', 'GET', null);
                const users = data.users || [];
                
                const usersMap = {};
                users.forEach(user => {
                    usersMap[user.id] = {
                        name: user.name || user.display_name || 'Unknown',
                        extension: user.extension_number || ''
                    };
                });
                
                return usersMap;
            } catch (error) {
                console.warn('Could not fetch Zoom users:', error);
                return {};
            }
        }

        async function filterDataFromSupabase(data) {

                if (!data || !Array.isArray(data)) {
        console.warn('filterDataFromSupabase: No data provided');
        return [];
    }
            
            return data.map(row => ({
                bookingDate: new Date(row.book_date),
                phoneNumber: cleanPhoneNumber(row.phone),
                setterId: row.setter_id ? row.setter_id.toString().trim() : '',
                originalPhone: row.phone,
                callId: row.id
            })).filter(booking => booking.phoneNumber && booking.setterId);
        }

        async function getZoomCallLogs(bookings, latestDate = null) {
            if (!bookings || bookings.length === 0) {
                return [];
            }

            const earliestBooking = bookings.reduce((earliest, booking) => 
                booking.bookingDate < earliest ? booking.bookingDate : earliest, 
                bookings[0]?.bookingDate || new Date());

            // Use provided latestDate or default to today
            const endDate = latestDate ? new Date(latestDate) : new Date();
            const maxLookbackDate = new Date(endDate);
            maxLookbackDate.setDate(maxLookbackDate.getDate() - MAX_LOOKBACK_DAYS);
            
            // Limit the date range to max lookback days
            const fromDateObj = earliestBooking < maxLookbackDate ? maxLookbackDate : earliestBooking;
            const fromDate = fromDateObj.toISOString().split('T')[0];
            const toDate = endDate.toISOString().split('T')[0];

            console.log(`Fetching Zoom calls from ${fromDate} to ${toDate}`);
            let allCalls = [];
            let nextPageToken = '';
            
            try {
                do {
                    const url = `https://zoom-api.floral-rain-cd3c.workers.dev/zoom-calls?from=${fromDate}&to=${toDate}${nextPageToken ? '&next_page_token=' + nextPageToken : ''}`;
                    
                    const data = await makeZoomApiCall(url, 'GET', null);
                    
                    allCalls = allCalls.concat(data.call_logs || []);
                    nextPageToken = data.next_page_token || '';
                    
                    console.log(`Fetched ${data.call_logs?.length || 0} calls, total: ${allCalls.length}`);
                    
                } while (nextPageToken);
                
                const filteredCalls = allCalls.filter(call => call.direction === 'outbound');
                
                return filteredCalls;
                
            } catch (error) {
                console.warn('Could not fetch call logs:', error);
                return [];
            }
        }

        function cleanPhoneNumber(phone) {
            if (!phone) return '';
            
            let cleaned = phone.toString().replace(/\D/g, '');
            
            if (cleaned.length === 10) {
                cleaned = '1' + cleaned;
            }
            
            return '+' + cleaned;
        }

        function analyzeResponseTimes(bookings, callLogs, usersMap) {
            const results = [];
            
            bookings.forEach(booking => {
                const relevantCalls = callLogs.filter(call => {
                    const callDate = new Date(call.date_time);
                    const phoneMatch = cleanPhoneNumber(call.callee_number) === booking.phoneNumber;
                    const timeMatch = callDate >= booking.bookingDate;
                    
                    return phoneMatch && timeMatch;
                });
                
                relevantCalls.sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
                
                let analysis = {
                    callId: booking.callId,
                    bookingDate: booking.bookingDate,
                    phoneNumber: booking.phoneNumber,
                    originalPhone: booking.originalPhone,
                    expectedSetter: booking.setterId,
                    called: false,
                    firstCallDate: null,
                    responseTimeHours: null,
                    responseTimeMinutes: null,
                    actualCaller: null,
                    actualCallerExtension: null,
                    correctSetter: false,
                    callResult: null,
                    callDuration: null
                };
                
                if (relevantCalls.length > 0) {
                    const firstCall = relevantCalls[0];
                    const firstCallDate = new Date(firstCall.date_time);
                    const responseTimeMs = firstCallDate - booking.bookingDate;
                    const responseTimeHours = responseTimeMs / (1000 * 60 * 60);
                    const responseTimeMinutes = responseTimeMs / (1000 * 60);
                    
                    let actualCaller = 'Unknown';
                    let actualExtension = '';
                    
                    if (firstCall.user_id && usersMap[firstCall.user_id]) {
                        actualCaller = usersMap[firstCall.user_id].name;
                        actualExtension = usersMap[firstCall.user_id].extension;
                    } else if (firstCall.owner && firstCall.owner.name !== 'Main Auto Receptionist') {
                        actualCaller = firstCall.owner.name;
                        actualExtension = firstCall.owner.extension_number || '';
                    }
                    
                    const expectedSetterLower = booking.setterId.toLowerCase().trim();
                    const actualCallerLower = actualCaller.toLowerCase().trim();
                    const correctSetter = expectedSetterLower === actualCallerLower || 
                                         actualCallerLower.includes(expectedSetterLower) ||
                                         expectedSetterLower.includes(actualCallerLower);
                    
                    analysis = {
                        ...analysis,
                        called: true,
                        firstCallDate: firstCallDate,
                        responseTimeHours: Math.round(responseTimeHours * 100) / 100,
                        responseTimeMinutes: Math.round(responseTimeMinutes),
                        actualCaller: actualCaller,
                        actualCallerExtension: actualExtension,
                        correctSetter: correctSetter,
                        callResult: firstCall.result || '',
                        callDuration: firstCall.duration || 0
                    };
                }
                
                results.push(analysis);
            });
            
            return results;
        }

        // function displayResults(analysis) {
        //     // Hide loading section
        //     document.getElementById('loadingSection').style.display = 'none';
            
        //     // Show results section
        //     document.getElementById('resultsSection').style.display = 'block';
            
        //     // Calculate and display stats
        //     displayStats(analysis);
            
        //     // Display table
        //     displayTable(analysis);
        // }

        // function displayStats(analysis) {
        //     const statsGrid = document.getElementById('statsGrid');
            
        //     const totalBookings = analysis.length;
        //     const calledBookings = analysis.filter(a => a.status === 'Called').length;
        //     const correctSetterCalls = analysis.filter(a => a.correctSetter).length;
        //     const avgResponseTime = analysis
        //         .filter(a => a.responseTimeHours !== null)
        //         .reduce((sum, a) => sum + a.responseTimeHours, 0) / (calledBookings || 1);
            
        //     statsGrid.innerHTML = `
        //         <div class="stat-card">
        //             <div class="stat-number">${totalBookings}</div>
        //             <div class="stat-label">Total Bookings</div>
        //         </div>
        //         <div class="stat-card">
        //             <div class="stat-number">${calledBookings}</div>
        //             <div class="stat-label">Calls Made</div>
        //         </div>
        //         <div class="stat-card">
        //             <div class="stat-number">${Math.round((calledBookings / totalBookings) * 100)}%</div>
        //             <div class="stat-label">Call Rate</div>
        //         </div>
        //         <div class="stat-card">
        //             <div class="stat-number">${correctSetterCalls}</div>
        //             <div class="stat-label">Correct Setter</div>
        //         </div>
        //         <div class="stat-card">
        //             <div class="stat-number">${Math.round(avgResponseTime * 10) / 10}h</div>
        //             <div class="stat-label">Avg Response Time</div>
        //         </div>
        //     `;
        // }

        // function displayTable(analysis) {
        //     const tbody = document.querySelector('#resultsTable tbody');
        //     let i = 0;
        //     const today = new Date().toISOString().split('T')[0];
        //     tbody.innerHTML = analysis.map( (item,i) => `
        //         <tr>
        //             <td>${item.bookingDate.toLocaleString()}</td>
        //             <td><a href="https://www.zoom.us/pbx/page/telephone/callLog#/call-log?page_size=15&page_number=1&from=2025-07-01&to=${today}&keyword=${item.originalPhone}">${item.originalPhone}</td>
        //             <td><a href="/setter?setter=${item.expectedSetter}"> ${item.expectedSetter}</a></td>
        //             <td><span class="status-badge ${item.status === 'Called' ? 'called' : 'no-call'}">${item.status}</span></td>
        //             <td>${item.firstCallDate ? item.firstCallDate.toLocaleString() : '-'}</td>
        //             <td>${item.responseTimeHours !== null ? 
        //                 `<span class="response-time ${getResponseTimeClass(item.responseTimeMinutes)}"> ${item.responseTimeMinutes}m </span>` 
        //                 : '-'}</td>
        //             <td>${item.actualCaller || '-'}</td>
        //             <td><span class="correct-setter ${item.correctSetter ? 'yes' : 'no'}">${item.correctSetter ? 'YES' : 'NO'}</span></td>
        //             <td>${item.callResult || '-'}</td>
        //             <td>${item.callDuration || '-'}</td>
        //         </tr>
        //     `).join('');
        // }

        // function getResponseTimeClass(hours) {
        //     if (hours <= 5) return 'fast';
        //     if (hours <= 10) return 'medium';
        //     return 'slow';
        // }

        // function exportToCSV() {
        //     if (analysisResults.length === 0) return;
            
        //     const headers = [
        //         'Booking Date',
        //         'Phone Number',
        //         'Expected Setter',
        //         'Status',
        //         'First Call Date',
        //         'Response Time (Hours)',
        //         'Response Time (Minutes)',
        //         'Actual Caller',
        //         'Caller Extension',
        //         'Correct Setter?',
        //         'Call Result',
        //         'Call Duration (sec)'
        //     ];
            
        //     const csvContent = [
        //         headers.join(','),
        //         ...analysisResults.map(item => [
        //             `"${item.bookingDate.toISOString()}"`,
        //             `"${item.originalPhone}"`,
        //             `"${item.expectedSetter}"`,
        //             `"${item.status}"`,
        //             item.firstCallDate ? `"${item.firstCallDate.toISOString()}"` : '""',
        //             item.responseTimeHours || '',
        //             item.responseTimeMinutes || '',
        //             `"${item.actualCaller || ''}"`,
        //             `"${item.actualCallerExtension || ''}"`,
        //             item.correctSetter ? 'YES' : 'NO',
        //             `"${item.callResult || ''}"`,
        //             item.callDuration || ''
        //         ].join(','))
        //     ].join('\n');
            
        //     const blob = new Blob([csvContent], { type: 'text/csv' });
        //     const url = window.URL.createObjectURL(blob);
        //     const a = document.createElement('a');
        //     a.setAttribute('hidden', '');
        //     a.setAttribute('href', url);
        //     a.setAttribute('download', `booking-response-analysis-${new Date().toISOString().split('T')[0]}.csv`);
        //     document.body.appendChild(a);
        //     a.click();
        //     document.body.removeChild(a);
        // }
