class TaskManager {
    constructor() {
        this.geojsonData = null;
        this.sequences = [];
        this.currentIndex = 0;
        this.map = null;
        this.currentPreviewSequence = null;
        this.currentView = 'all'; // 'all', 'active', 'done', or 'skipped'
        this.navigatingToSequenceId = null; // Track sequence we're navigating to for highlighting
        this.allTasksSearchTerm = ''; // Track search term for "All Tasks" tab
        this.previewEditMode = false; // Track if preview is in edit mode
        this.originalPreviewFeatures = null; // Store original features for revert
        this.editableLayers = []; // Track editable layers
        this.osmDataLayer = null; // OSM data layer for preview
        this.osmNodes = new Map(); // Store OSM nodes for snapping (key: node id, value: {lat, lon})
        this.osmWays = []; // Store OSM ways for snapping reference
        this.snapThreshold = 0.0001; // ~10 meters snapping threshold
        
        // Hybrid mode: local helper for JOSM integration
        this.localHelperUrl = null; // Will be set if local helper is detected
        this.localHelperPort = 8001; // Default helper port
        this.isLocalMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        // Detect local helper on startup
        this.detectLocalHelper();
        
        // Oneway state
        this.onewayArrows = new Map(); // Map of way IDs to arrow layers
        
        // Way selection and splitting
        this.selectedWayLayer = null; // Currently selected way layer for tag editing
        this.splitMode = false; // Track if split mode is enabled
        this.waySegments = new Map(); // Map of layer IDs to arrays of segment indices (for split ways)
        this.splitSegments = []; // Store both segments after splitting for easy selection
        
        // Workflow state
        this.workflowStep = 'preview'; // 'preview', 'edit', 'split', 'tag'
        this.workflowCompleted = {
            preview: false,
            edit: false,
            split: false,
            tag: false
        };
        
        // Node selection mode for custom way splitting
        this.nodeSelectionMode = false; // Track if node selection mode is enabled
        this.selectedNodes = []; // Array of {layer, nodeIndex, latlng} objects for selected nodes
        
        // Undo/Redo history
        this.editHistory = []; // Array of geometry states
        this.currentHistoryIndex = -1; // Current position in history (-1 means no history)
        this.maxHistorySize = 50; // Maximum number of history states to keep
        
        // Multi-select state
        this.selectedLayers = []; // Array of selected layers for multi-select
        this.multiSelectMode = false; // Track if multi-select mode is enabled
        
        // Clipboard for copy/paste
        this.clipboard = null; // Store copied features
        
        // Tag presets
        this.tagPresets = {
            'residential': { highway: 'residential' },
            'primary': { highway: 'primary' },
            'secondary': { highway: 'secondary' },
            'tertiary': { highway: 'tertiary' },
            'service': { highway: 'service' },
            'track': { highway: 'track' },
            'path': { highway: 'path' },
            'footway': { highway: 'footway' },
            'cycleway': { highway: 'cycleway' }
        };
        this.customTagPresets = JSON.parse(localStorage.getItem('customTagPresets') || '[]');
        
        // Measurement tool state
        this.measurementMode = false;
        this.measurementPoints = [];
        this.measurementLayer = null;
        
        // Search state
        this.searchResults = [];
        
        // Layer visibility state
        this.layerVisibility = {
            gpsTraces: true,
            osmData: true,
            onewayArrows: true
        };
        
        this.init();
    }

    async init() {
        // Initialize IndexedDB
        try {
            await storageManager.init();
        } catch (error) {
            console.error('Failed to initialize IndexedDB:', error);
        }
        
        this.initializeEventListeners();
        this.initializeKeyboardShortcuts();
        await this.loadFromStorage();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('fileInput');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                console.log('File input change event triggered', e.target.files);
                this.handleFileUpload(e);
            });
            console.log('File input event listener attached');
        } else {
            console.error('File input element not found!');
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.showPrevious());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.showNext());
        }
    }

    async handleFileUpload(event) {
        console.log('handleFileUpload called', event);
        const files = Array.from(event.target.files);
        console.log('Files selected:', files.length, files.map(f => f.name));
        if (files.length === 0) {
            console.warn('No files selected');
            return;
        }

        const fileInfo = document.getElementById('fileInfo');
        if (fileInfo) {
            fileInfo.textContent = `Loading ${files.length} file(s)...`;
        } else {
            console.warn('fileInfo element not found');
        }

        // Process all files with progress tracking
        const promises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const fileName = file.name.toLowerCase();
                        let geojson;

                        // Detect file type and parse accordingly
                        if (fileName.endsWith('.gpx')) {
                            geojson = this.parseGPX(e.target.result);
                        } else if (fileName.endsWith('.csv')) {
                            // Use async CSV parsing for large files (> 100 rows)
                            const lineCount = (e.target.result.match(/\n/g) || []).length;
                            if (lineCount > 100) {
                                geojson = await this.parseCSVAsync(e.target.result, (progress) => {
                                    if (fileInfo && files.length === 1) {
                                        fileInfo.textContent = `Processing CSV: ${progress}%...`;
                                    }
                                });
                            } else {
                                geojson = this.parseCSV(e.target.result);
                            }
                        } else {
                            // Assume GeoJSON
                            geojson = JSON.parse(e.target.result);
                        }

                        resolve({ geojson, fileName: file.name });
                    } catch (error) {
                        reject({ error, fileName: file.name });
                    }
                };
                reader.onerror = () => reject({ error: new Error('Failed to read file'), fileName: file.name });
                reader.readAsText(file);
            });
        });

        // Combine all files into one GeoJSON
        const results = await Promise.allSettled(promises);
        const newFeatures = [];
        const errors = [];
        let loadedCount = 0;

        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                const geojson = result.value.geojson;
                if (geojson && geojson.features && Array.isArray(geojson.features)) {
                    newFeatures.push(...geojson.features);
                    loadedCount++;
                } else {
                    console.error('Invalid GeoJSON structure in file:', result.value.fileName, geojson);
                    errors.push(`${result.value.fileName}: Invalid GeoJSON structure - missing features array`);
                }
            } else {
                console.error('File processing error:', result.reason);
                errors.push(`${result.reason.fileName}: ${result.reason.error.message}`);
            }
        });

        if (newFeatures.length === 0) {
            if (fileInfo) {
                fileInfo.textContent = `✗ Error: No valid files loaded. ${errors.join('; ')}`;
            }
            return;
        }

        // Merge with existing cached data instead of replacing
        const existingFeatures = this.geojsonData?.features || [];
        const allFeatures = [...existingFeatures, ...newFeatures];

        // Combine all features into one GeoJSON
        const combinedGeoJSON = {
            type: 'FeatureCollection',
            features: allFeatures
        };

        this.geojsonData = combinedGeoJSON;
        
        // Process with progress indicator for large datasets
        try {
            if (allFeatures.length > 50) {
                if (fileInfo) {
                    fileInfo.textContent = `Processing ${allFeatures.length} features...`;
                }
                await this.processGeoJSONAsync(combinedGeoJSON, (progress) => {
                    if (fileInfo) {
                        fileInfo.textContent = `Processing: ${progress}%...`;
                    }
                });
            } else {
                await this.processGeoJSON(combinedGeoJSON);
            }
            
            // Save to IndexedDB
            await this.saveToStorage();
            
            const errorMsg = errors.length > 0 ? ` (${errors.length} error(s))` : '';
            const totalFeatures = allFeatures.length;
            const addedCount = newFeatures.length;
            const fileInfoText = `✓ Loaded ${loadedCount} file(s)${errorMsg}: ${addedCount} features (Total: ${totalFeatures} features)`;
            
            if (fileInfo) {
                fileInfo.textContent = fileInfoText;
            }
            
            // Ensure UI is updated
            this.renderCurrentTask();
            this.updateSummary();
        } catch (error) {
            console.error('Error processing file upload:', error);
            if (fileInfo) {
                fileInfo.textContent = `✗ Error processing files: ${error.message}`;
            }
            alert(`Error processing files: ${error.message}`);
        }
    }

    async processGeoJSON(geojson) {
        if (!geojson.features || !Array.isArray(geojson.features)) {
            throw new Error('Invalid GeoJSON: missing features array');
        }

        // Preserve existing status values
        const existingStatusMap = new Map();
        this.sequences.forEach(seq => {
            if (seq.status !== undefined) {
                existingStatusMap.set(String(seq.id), seq.status);
            }
        });

        // Group features by sequence ID
        const sequenceMap = new Map();

        geojson.features.forEach((feature) => {
            const sequenceId = String(
                feature.properties?.sequence_id || 
                feature.properties?.sequenceId || 
                feature.properties?.sequence || 
                feature.properties?.id ||
                feature.properties?.seq ||
                `sequence_${feature.properties?.id || Math.random().toString(36).substr(2, 9)}`
            );

            if (!sequenceMap.has(sequenceId)) {
                const existingStatus = existingStatusMap.get(sequenceId);
                sequenceMap.set(sequenceId, {
                    id: sequenceId,
                    features: [],
                    status: existingStatus !== undefined ? existingStatus : '', // blank = active
                    date: new Date().toLocaleDateString()
                });
            }

            sequenceMap.get(sequenceId).features.push(feature);
        });

        // Convert to array and calculate stats
        this.sequences = Array.from(sequenceMap.values()).map(seq => {
            const stats = this.calculateStats(seq.features);
            return {
                ...seq,
                featureCount: stats.features,
                nodeCount: stats.nodes,
                wayCount: stats.ways
            };
        });

        // Sort by sequence ID (numeric if possible, otherwise alphabetical)
        this.sequences.sort((a, b) => {
            const aNum = parseInt(a.id);
            const bNum = parseInt(b.id);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            return a.id.localeCompare(b.id);
        });

        // Reset to first item in current view
        const viewSequences = this.getCurrentViewSequences();
        if (viewSequences.length > 0) {
            const firstSequence = viewSequences[0];
            this.currentIndex = this.sequences.findIndex(seq => seq.id === firstSequence.id);
        } else {
            this.currentIndex = 0;
        }

        this.geojsonData = geojson;
        await this.saveToStorage();
        this.renderCurrentTask();
        this.updateSummary();
    }

    async processGeoJSONAsync(geojson, progressCallback) {
        // Async version for large datasets - processes in chunks
        if (!geojson.features || !Array.isArray(geojson.features)) {
            console.error('Invalid GeoJSON: missing features array');
            return;
        }

        // Preserve existing status values
        const existingStatusMap = new Map();
        this.sequences.forEach(seq => {
            if (seq.status !== undefined) {
                existingStatusMap.set(String(seq.id), seq.status);
            }
        });

        // Group features by sequence ID - process in chunks
        const sequenceMap = new Map();
        const totalFeatures = geojson.features.length;
        const chunkSize = 100; // Process 100 features at a time

        for (let start = 0; start < totalFeatures; start += chunkSize) {
            const end = Math.min(start + chunkSize, totalFeatures);
            
            for (let i = start; i < end; i++) {
                const feature = geojson.features[i];
                const sequenceId = String(
                    feature.properties?.sequence_id || 
                    feature.properties?.sequenceId || 
                    feature.properties?.sequence || 
                    feature.properties?.id ||
                    feature.properties?.seq ||
                    `sequence_${feature.properties?.id || Math.random().toString(36).substr(2, 9)}`
                );

                if (!sequenceMap.has(sequenceId)) {
                    const existingStatus = existingStatusMap.get(sequenceId);
                    sequenceMap.set(sequenceId, {
                        id: sequenceId,
                        features: [],
                        status: existingStatus !== undefined ? existingStatus : '',
                        date: new Date().toLocaleDateString()
                    });
                }

                sequenceMap.get(sequenceId).features.push(feature);
            }

            // Update progress
            if (progressCallback) {
                const progress = Math.round((end / totalFeatures) * 50); // First 50% for grouping
                progressCallback(progress);
            }

            // Yield to browser
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Calculate stats in chunks
        const sequences = Array.from(sequenceMap.values());
        const processedSequences = [];
        const statsChunkSize = 50;

        for (let start = 0; start < sequences.length; start += statsChunkSize) {
            const end = Math.min(start + statsChunkSize, sequences.length);
            
            for (let i = start; i < end; i++) {
                const seq = sequences[i];
                const stats = this.calculateStats(seq.features);
                processedSequences.push({
                    ...seq,
                    featureCount: stats.features,
                    nodeCount: stats.nodes,
                    wayCount: stats.ways
                });
            }

            // Update progress
            if (progressCallback) {
                const progress = 50 + Math.round((end / sequences.length) * 50); // Second 50% for stats
                progressCallback(progress);
            }

            // Yield to browser
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Sort by sequence ID
        processedSequences.sort((a, b) => {
            const aNum = parseInt(a.id);
            const bNum = parseInt(b.id);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            return a.id.localeCompare(b.id);
        });

        this.sequences = processedSequences;
        this.geojsonData = geojson;
        
        // Reset to first item in current view
        const viewSequences = this.getCurrentViewSequences();
        if (viewSequences.length > 0) {
            const firstSequence = viewSequences[0];
            this.currentIndex = this.sequences.findIndex(seq => seq.id === firstSequence.id);
        } else {
            this.currentIndex = 0;
        }
        
        await this.saveToStorage();
        this.renderCurrentTask();
        this.updateSummary();
    }

    calculateStats(features) {
        let nodes = 0;
        let ways = 0;

        features.forEach(feature => {
            if (feature.geometry) {
                if (feature.geometry.type === 'Point') {
                    nodes++;
                } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
                    ways++;
                    if (feature.geometry.coordinates) {
                        if (Array.isArray(feature.geometry.coordinates[0])) {
                            nodes += feature.geometry.coordinates.length;
                        } else {
                            nodes += 1;
                        }
                    }
                } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                    ways++;
                    if (feature.geometry.coordinates && feature.geometry.coordinates[0]) {
                        nodes += feature.geometry.coordinates[0].length;
                    }
                }
            }
        });

        return {
            features: features.length,
            nodes: nodes,
            ways: ways
        };
    }

    parseGPX(gpxText) {
        // Parse GPX XML to GeoJSON format
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
        
        const features = [];
        
        // Parse tracks
        const tracks = xmlDoc.getElementsByTagName('trk');
        for (const track of tracks) {
            const segments = track.getElementsByTagName('trkseg');
            for (const segment of segments) {
                const points = segment.getElementsByTagName('trkpt');
                const coordinates = [];
                
                for (const point of points) {
                    const lat = parseFloat(point.getAttribute('lat'));
                    const lon = parseFloat(point.getAttribute('lon'));
                    if (!isNaN(lat) && !isNaN(lon)) {
                        coordinates.push([lon, lat]);
                    }
                }
                
                if (coordinates.length > 0) {
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: coordinates
                        },
                        properties: {
                            sequence_id: this.extractSequenceIdFromGPX(track) || `gpx_track_${features.length + 1}`
                        }
                    });
                }
            }
        }
        
        // Parse routes
        const routes = xmlDoc.getElementsByTagName('rte');
        for (const route of routes) {
            const points = route.getElementsByTagName('rtept');
            const coordinates = [];
            
            for (const point of points) {
                const lat = parseFloat(point.getAttribute('lat'));
                const lon = parseFloat(point.getAttribute('lon'));
                if (!isNaN(lat) && !isNaN(lon)) {
                    coordinates.push([lon, lat]);
                }
            }
            
            if (coordinates.length > 0) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    },
                    properties: {
                        sequence_id: this.extractSequenceIdFromGPX(route) || `gpx_route_${features.length + 1}`
                    }
                });
            }
        }
        
        // Parse waypoints as points
        const waypoints = xmlDoc.getElementsByTagName('wpt');
        for (const waypoint of waypoints) {
            const lat = parseFloat(waypoint.getAttribute('lat'));
            const lon = parseFloat(waypoint.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) {
                const nameEl = waypoint.getElementsByTagName('name')[0];
                const name = nameEl ? nameEl.textContent : '';
                
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [lon, lat]
                    },
                    properties: {
                        name: name,
                        sequence_id: name || `gpx_waypoint_${features.length + 1}`
                    }
                });
            }
        }
        
        return {
            type: 'FeatureCollection',
            features: features
        };
    }

    extractSequenceIdFromGPX(element) {
        // Try to find sequence ID in name, desc, or extensions
        const nameEl = element.getElementsByTagName('name')[0];
        if (nameEl) {
            const name = nameEl.textContent.trim();
            // Check if name contains a sequence ID pattern
            const seqMatch = name.match(/(?:sequence[_\s]?id|seq[_\s]?id|id)[:\s=]+(\d+)/i);
            if (seqMatch) {
                return seqMatch[1];
            }
            // If name is just a number, use it as sequence ID
            if (/^\d+$/.test(name)) {
                return name;
            }
        }
        return null;
    }

    // Geohash decoder
    decodeGeohash(geohash) {
        const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
        let even = true;
        let latMin = -90.0, latMax = 90.0;
        let lonMin = -180.0, lonMax = 180.0;
        
        for (let i = 0; i < geohash.length; i++) {
            const char = geohash[i].toLowerCase();
            const val = base32.indexOf(char);
            if (val === -1) return null;
            
            for (let j = 4; j >= 0; j--) {
                const bitVal = (val >> j) & 1;
                if (even) {
                    const lonMid = (lonMin + lonMax) / 2;
                    if (bitVal === 1) {
                        lonMin = lonMid;
                    } else {
                        lonMax = lonMid;
                    }
                } else {
                    const latMid = (latMin + latMax) / 2;
                    if (bitVal === 1) {
                        latMin = latMid;
                    } else {
                        latMax = latMid;
                    }
                }
                even = !even;
            }
        }
        
        const lat = (latMin + latMax) / 2;
        const lon = (lonMin + lonMax) / 2;
        
        return { lat, lon };
    }

    parseCSV(csvText) {
        // Synchronous version for small files (< 100 rows)
        return this.parseCSVSync(csvText);
    }

    async parseCSVAsync(csvText, progressCallback) {
        // Async version for large files - processes in chunks
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV file must have at least a header row and one data row');
        }

        // Parse header
        const header = this.parseCSVLine(lines[0]);
        
        // Find columns (case-insensitive)
        let latLongArrayIndex = -1;
        let latIndex = -1;
        let lonIndex = -1;
        let geohashIndex = -1;
        let sequenceIdIndex = -1;
        
        const latLongArrayNames = ['lat_long_array', 'latlongarray', 'coordinates', 'coords', 'points'];
        const latNames = ['lat', 'latitude', 'y', 'ycoord'];
        const lonNames = ['lon', 'lng', 'longitude', 'long', 'x', 'xcoord'];
        const geohashNames = ['geohash', 'geohash_code', 'hash'];
        const seqIdNames = ['offroad_sequence_id', 'sequence_id', 'sequenceid', 'sequence', 'seq', 'id', 'sample_bookings'];
        
        header.forEach((col, index) => {
            const colLower = col.toLowerCase().trim();
            if (latLongArrayIndex === -1 && latLongArrayNames.some(name => colLower === name)) {
                latLongArrayIndex = index;
            }
            if (latIndex === -1 && latNames.some(name => colLower.includes(name))) {
                latIndex = index;
            }
            if (lonIndex === -1 && lonNames.some(name => colLower.includes(name))) {
                lonIndex = index;
            }
            if (geohashIndex === -1 && geohashNames.some(name => colLower === name)) {
                geohashIndex = index;
            }
            if (sequenceIdIndex === -1 && seqIdNames.some(name => colLower === name)) {
                sequenceIdIndex = index;
            }
        });

        // Check if we have lat_long_array format, separate lat/lon columns, or geohash
        if (latLongArrayIndex === -1 && (latIndex === -1 || lonIndex === -1) && geohashIndex === -1) {
            throw new Error('CSV must contain either:\n1. A lat_long_array column with coordinate arrays, OR\n2. Separate latitude and longitude columns, OR\n3. A geohash column');
        }

        // Group rows by sequence ID - process in chunks
        const sequenceMap = new Map();
        const totalRows = lines.length - 1;
        const chunkSize = 50; // Process 50 rows at a time
        
        for (let start = 1; start < lines.length; start += chunkSize) {
            const end = Math.min(start + chunkSize, lines.length);
            
            for (let i = start; i < end; i++) {
                const row = this.parseCSVLine(lines[i]);
                if (row.length === 0) continue;
                
                // Get sequence ID
                let sequenceId;
                if (sequenceIdIndex >= 0 && row[sequenceIdIndex] && row[sequenceIdIndex].trim()) {
                    sequenceId = String(row[sequenceIdIndex]).trim();
                } else {
                    const groupIndex = header.findIndex(col => col.toLowerCase().trim() === 'group');
                    if (groupIndex >= 0 && row[groupIndex] && row[groupIndex].trim()) {
                        sequenceId = String(row[groupIndex]).trim();
                    } else {
                        sequenceId = `csv_sequence_${i}`;
                    }
                }
                
                if (!sequenceMap.has(sequenceId)) {
                    sequenceMap.set(sequenceId, {
                        id: sequenceId,
                        coordinates: [],
                        properties: {},
                        rowCount: 0
                    });
                }
                
                const sequence = sequenceMap.get(sequenceId);
                sequence.rowCount++;
                
                // Merge properties
                if (sequence.rowCount === 1) {
                    header.forEach((colName, idx) => {
                        if (row[idx] && row[idx].trim()) {
                            sequence.properties[colName.trim()] = row[idx].trim();
                        }
                    });
                } else {
                    header.forEach((colName, idx) => {
                        const colLower = colName.toLowerCase().trim();
                        if (row[idx] && row[idx].trim()) {
                            if (colLower === 'bookingcodes' || colLower === 'wheels') {
                                try {
                                    const existing = JSON.parse(sequence.properties[colName] || '[]');
                                    const newArray = JSON.parse(row[idx].trim());
                                    if (Array.isArray(existing) && Array.isArray(newArray)) {
                                        const merged = [...new Set([...existing, ...newArray])];
                                        sequence.properties[colName] = JSON.stringify(merged);
                                    }
                                } catch (e) {
                                    // Keep existing value if merge fails
                                }
                            }
                        }
                    });
                }
                
                // Extract coordinates
                let rowCoordinates = [];
                if (latLongArrayIndex >= 0 && row[latLongArrayIndex]) {
                    try {
                        const arrayStr = row[latLongArrayIndex].trim();
                        const coordArray = JSON.parse(arrayStr);
                        if (Array.isArray(coordArray)) {
                            rowCoordinates = coordArray.map(coord => {
                                if (Array.isArray(coord) && coord.length >= 2) {
                                    return [parseFloat(coord[1]), parseFloat(coord[0])];
                                }
                                return null;
                            }).filter(coord => coord !== null && !isNaN(coord[0]) && !isNaN(coord[1]));
                        }
                    } catch (e) {
                        // Skip invalid coordinates
                    }
                } else if (geohashIndex >= 0 && row[geohashIndex]) {
                    // Decode geohash
                    const geohash = row[geohashIndex].trim();
                    const decoded = this.decodeGeohash(geohash);
                    if (decoded && !isNaN(decoded.lat) && !isNaN(decoded.lon)) {
                        rowCoordinates = [[decoded.lon, decoded.lat]];
                    }
                } else if (latIndex >= 0 && lonIndex >= 0) {
                    const lat = parseFloat(row[latIndex]);
                    const lon = parseFloat(row[lonIndex]);
                    if (!isNaN(lat) && !isNaN(lon)) {
                        rowCoordinates = [[lon, lat]];
                    }
                }
                
                if (rowCoordinates.length > 0) {
                    sequence.coordinates.push(...rowCoordinates);
                }
            }
            
            // Update progress and yield to browser
            if (progressCallback) {
                const progress = Math.round(((end - 1) / totalRows) * 100);
                progressCallback(progress);
            }
            
            // Yield to browser to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Convert sequences to features
        const features = [];
        sequenceMap.forEach((sequence) => {
            if (sequence.coordinates.length === 0) return;
            
            sequence.properties.sequence_id = sequence.id;
            
            if (sequence.coordinates.length === 1) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: sequence.coordinates[0]
                    },
                    properties: sequence.properties
                });
            } else {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: sequence.coordinates
                    },
                    properties: sequence.properties
                });
            }
        });

        return {
            type: 'FeatureCollection',
            features: features
        };
    }

    parseCSVSync(csvText) {
        // Synchronous version for small files
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV file must have at least a header row and one data row');
        }

        const header = this.parseCSVLine(lines[0]);
        
        let latLongArrayIndex = -1;
        let latIndex = -1;
        let lonIndex = -1;
        let geohashIndex = -1;
        let sequenceIdIndex = -1;
        
        const latLongArrayNames = ['lat_long_array', 'latlongarray', 'coordinates', 'coords', 'points'];
        const latNames = ['lat', 'latitude', 'y', 'ycoord'];
        const lonNames = ['lon', 'lng', 'longitude', 'long', 'x', 'xcoord'];
        const geohashNames = ['geohash', 'geohash_code', 'hash'];
        const seqIdNames = ['offroad_sequence_id', 'sequence_id', 'sequenceid', 'sequence', 'seq', 'id', 'sample_bookings'];
        
        header.forEach((col, index) => {
            const colLower = col.toLowerCase().trim();
            if (latLongArrayIndex === -1 && latLongArrayNames.some(name => colLower === name)) {
                latLongArrayIndex = index;
            }
            if (latIndex === -1 && latNames.some(name => colLower.includes(name))) {
                latIndex = index;
            }
            if (lonIndex === -1 && lonNames.some(name => colLower.includes(name))) {
                lonIndex = index;
            }
            if (geohashIndex === -1 && geohashNames.some(name => colLower === name)) {
                geohashIndex = index;
            }
            if (sequenceIdIndex === -1 && seqIdNames.some(name => colLower === name)) {
                sequenceIdIndex = index;
            }
        });

        if (latLongArrayIndex === -1 && (latIndex === -1 || lonIndex === -1) && geohashIndex === -1) {
            throw new Error('CSV must contain either:\n1. A lat_long_array column with coordinate arrays, OR\n2. Separate latitude and longitude columns, OR\n3. A geohash column');
        }

        const sequenceMap = new Map();
        
        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i]);
            if (row.length === 0) continue;
            
            let sequenceId;
            if (sequenceIdIndex >= 0 && row[sequenceIdIndex] && row[sequenceIdIndex].trim()) {
                sequenceId = String(row[sequenceIdIndex]).trim();
            } else {
                const groupIndex = header.findIndex(col => col.toLowerCase().trim() === 'group');
                if (groupIndex >= 0 && row[groupIndex] && row[groupIndex].trim()) {
                    sequenceId = String(row[groupIndex]).trim();
                } else {
                    sequenceId = `csv_sequence_${i}`;
                }
            }
            
            if (!sequenceMap.has(sequenceId)) {
                sequenceMap.set(sequenceId, {
                    id: sequenceId,
                    coordinates: [],
                    properties: {},
                    rowCount: 0
                });
            }
            
            const sequence = sequenceMap.get(sequenceId);
            sequence.rowCount++;
            
            if (sequence.rowCount === 1) {
                header.forEach((colName, idx) => {
                    if (row[idx] && row[idx].trim()) {
                        sequence.properties[colName.trim()] = row[idx].trim();
                    }
                });
            } else {
                header.forEach((colName, idx) => {
                    const colLower = colName.toLowerCase().trim();
                    if (row[idx] && row[idx].trim()) {
                        if (colLower === 'bookingcodes' || colLower === 'wheels') {
                            try {
                                const existing = JSON.parse(sequence.properties[colName] || '[]');
                                const newArray = JSON.parse(row[idx].trim());
                                if (Array.isArray(existing) && Array.isArray(newArray)) {
                                    const merged = [...new Set([...existing, ...newArray])];
                                    sequence.properties[colName] = JSON.stringify(merged);
                                }
                            } catch (e) {
                                // Keep existing value
                            }
                        }
                    }
                });
            }
            
            let rowCoordinates = [];
            if (latLongArrayIndex >= 0 && row[latLongArrayIndex]) {
                try {
                    const arrayStr = row[latLongArrayIndex].trim();
                    const coordArray = JSON.parse(arrayStr);
                    if (Array.isArray(coordArray)) {
                        rowCoordinates = coordArray.map(coord => {
                            if (Array.isArray(coord) && coord.length >= 2) {
                                return [parseFloat(coord[1]), parseFloat(coord[0])];
                            }
                            return null;
                        }).filter(coord => coord !== null && !isNaN(coord[0]) && !isNaN(coord[1]));
                    }
                } catch (e) {
                    // Skip invalid
                }
            } else if (geohashIndex >= 0 && row[geohashIndex]) {
                // Decode geohash
                const geohash = row[geohashIndex].trim();
                const decoded = this.decodeGeohash(geohash);
                if (decoded && !isNaN(decoded.lat) && !isNaN(decoded.lon)) {
                    rowCoordinates = [[decoded.lon, decoded.lat]];
                }
            } else if (latIndex >= 0 && lonIndex >= 0) {
                const lat = parseFloat(row[latIndex]);
                const lon = parseFloat(row[lonIndex]);
                if (!isNaN(lat) && !isNaN(lon)) {
                    rowCoordinates = [[lon, lat]];
                }
            }
            
            if (rowCoordinates.length > 0) {
                sequence.coordinates.push(...rowCoordinates);
            }
        }

        const features = [];
        sequenceMap.forEach((sequence) => {
            if (sequence.coordinates.length === 0) return;
            
            sequence.properties.sequence_id = sequence.id;
            
            if (sequence.coordinates.length === 1) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: sequence.coordinates[0]
                    },
                    properties: sequence.properties
                });
            } else {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: sequence.coordinates
                    },
                    properties: sequence.properties
                });
            }
        });

        return {
            type: 'FeatureCollection',
            features: features
        };
    }

    parseCSVLine(line) {
        // Simple CSV parser that handles quoted fields
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        
        return result;
    }

    getAllSequences() {
        // Return all sequences regardless of status (master data source)
        return this.sequences;
    }

    getActiveSequences() {
        // Return sequences that are not skipped or done (blank status = active)
        return this.sequences.filter(seq => !seq.status || seq.status === '');
    }

    getDoneSequences() {
        // Return sequences that are marked as done
        return this.sequences.filter(seq => seq.status === 'done');
    }

    getSkippedSequences() {
        // Return sequences that are marked as skipped
        return this.sequences.filter(seq => seq.status === 'skipped');
    }

    getCurrentViewSequences() {
        // Return sequences based on current view
        switch(this.currentView) {
            case 'all':
                return this.getAllSequences();
            case 'done':
                return this.getDoneSequences();
            case 'skipped':
                return this.getSkippedSequences();
            case 'active':
            default:
                return this.getActiveSequences();
        }
    }

    switchView(view, targetSequenceId = null) {
        this.currentView = view;
        
        // Update tab buttons (support both old .tab-btn and new .filter-tab classes)
        document.querySelectorAll('.tab-btn, .filter-tab').forEach(btn => {
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // If targetSequenceId is provided, navigate to that specific sequence
        if (targetSequenceId !== null) {
            const targetIndex = this.sequences.findIndex(seq => seq.id === targetSequenceId);
            if (targetIndex >= 0) {
                this.currentIndex = targetIndex;
                this.renderCurrentTask();
                return;
            }
        }
        
        // Reset to first item in the new view
        const viewSequences = this.getCurrentViewSequences();
        if (viewSequences.length > 0) {
            const firstSequence = viewSequences[0];
            this.currentIndex = this.sequences.findIndex(seq => seq.id === firstSequence.id);
        } else {
            this.currentIndex = 0;
        }
        
        this.renderCurrentTask();
    }

    navigateToSequence(sequenceId) {
        // Find the sequence in our data
        const sequence = this.sequences.find(seq => seq.id === sequenceId);
        if (!sequence) {
            console.error('Sequence not found:', sequenceId);
            return;
        }

        // Set flag to indicate we're navigating to this sequence (for highlighting)
        this.navigatingToSequenceId = sequenceId;

        // Determine which tab this sequence belongs to based on status
        let targetView = 'active'; // default to active
        if (sequence.status === 'done') {
            targetView = 'done';
        } else if (sequence.status === 'skipped') {
            targetView = 'skipped';
        } else {
            targetView = 'active';
        }

        // Switch to the appropriate tab and navigate to the sequence
        this.switchView(targetView, sequenceId);
    }

    renderCurrentTask() {
        // Route to appropriate render method based on view
        switch(this.currentView) {
            case 'all':
                this.renderAllTasksView();
                break;
            case 'skipped':
            case 'done':
                this.renderSimpleListView();
                break;
            case 'active':
            default:
                this.renderDetailedView();
                break;
        }
    }

    renderAllTasksView() {
        const taskDisplay = document.getElementById('taskDisplay');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const taskCounter = document.getElementById('taskCounter');

        const allSequences = this.getAllSequences();
        
        if (allSequences.length === 0) {
            taskDisplay.innerHTML = `
                <div class="empty-state">
                    <p>No tasks found. Upload a file to begin.</p>
                </div>
            `;
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (taskCounter) taskCounter.textContent = '';
            return;
        }

        // Hide navigation for "All Tasks" - show full list
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';

        // Filter sequences based on search term
        const searchTerm = this.allTasksSearchTerm.toLowerCase().trim();
        const filteredSequences = searchTerm 
            ? allSequences.filter(seq => String(seq.id).toLowerCase().includes(searchTerm))
            : allSequences;

        if (taskCounter) {
            if (searchTerm) {
                taskCounter.textContent = `Showing ${filteredSequences.length} of ${allSequences.length} sequences`;
            } else {
                taskCounter.textContent = `Total: ${allSequences.length} sequences`;
            }
        }

        // Render simple list of all sequence IDs (clickable)
        const sequenceList = filteredSequences.map(seq => {
            const escapedId = String(seq.id).replace(/'/g, "\\'").replace(/"/g, "&quot;");
            return `<div class="sequence-id-item clickable" data-sequence-id="${escapedId}" onclick="taskManager.navigateToSequence('${escapedId}')">${seq.id}</div>`;
        }).join('');

        taskDisplay.innerHTML = `
            <div class="all-tasks-list">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <h4>All Sequence IDs (${allSequences.length} total)</h4>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <div style="position: relative; flex: 1; min-width: 200px;">
                            <input 
                                type="text" 
                                id="allTasksSearchInput" 
                                class="search-input" 
                                placeholder="🔍 Search sequence ID..." 
                                value="${this.allTasksSearchTerm}"
                                oninput="taskManager.handleAllTasksSearch(this.value)"
                            />
                        </div>
                        <button class="btn btn-primary" onclick="taskManager.exportAllToCSV()" style="white-space: nowrap;">
                            📊 Export to CSV
                        </button>
                    </div>
                </div>
                ${filteredSequences.length === 0 && searchTerm ? `
                    <div class="empty-state">
                        <p>No sequences found matching "${this.allTasksSearchTerm}"</p>
                    </div>
                ` : `
                    <div class="sequence-list">
                        ${sequenceList}
                    </div>
                `}
            </div>
        `;
    }

    handleAllTasksSearch(searchTerm) {
        this.allTasksSearchTerm = searchTerm;
        
        // Get the search input element to preserve focus and cursor position
        const searchInput = document.getElementById('allTasksSearchInput');
        const wasFocused = document.activeElement === searchInput;
        const cursorPosition = searchInput ? searchInput.selectionStart : null;
        
        // Re-render the view
        this.renderAllTasksView();
        
        // Restore focus and cursor position if it was focused
        if (wasFocused) {
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                const newSearchInput = document.getElementById('allTasksSearchInput');
                if (newSearchInput) {
                    newSearchInput.focus();
                    // Set cursor position, accounting for the new value length
                    const newCursorPos = cursorPosition !== null 
                        ? Math.min(cursorPosition, newSearchInput.value.length) 
                        : newSearchInput.value.length;
                    newSearchInput.setSelectionRange(newCursorPos, newCursorPos);
                }
            });
        }
    }

    renderSimpleListView() {
        const taskDisplay = document.getElementById('taskDisplay');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const taskCounter = document.getElementById('taskCounter');

        const viewSequences = this.getCurrentViewSequences();
        
        if (viewSequences.length === 0) {
            const viewName = this.currentView === 'done' ? 'done' : 'skipped';
            taskDisplay.innerHTML = `
                <div class="empty-state">
                    <p>No ${viewName} tasks found.</p>
                </div>
            `;
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (taskCounter) taskCounter.textContent = '';
            return;
        }

        // Hide navigation for list view
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (taskCounter) taskCounter.textContent = `${viewSequences.length} ${this.currentView} sequence(s)`;

        // Render full list: Sequence ID + Status dropdown for each
        const viewName = this.currentView === 'done' ? 'Done' : 'Skipped';
        const sequenceList = viewSequences.map(seq => {
            const escapedId = String(seq.id).replace(/'/g, "\\'");
            const isTarget = this.navigatingToSequenceId && String(seq.id) === String(this.navigatingToSequenceId);
            return `
                <div class="sequence-item-with-status" data-sequence-id="${seq.id}" ${isTarget ? 'data-highlight="true"' : ''}>
                    <div class="sequence-id-display">${seq.id}</div>
                    <select class="status-dropdown-inline" data-sequence-id="${seq.id}" onchange="taskManager.updateStatus('${escapedId}', this.value)">
                        <option value="" ${!seq.status || seq.status === '' ? 'selected' : ''}>Active (Blank)</option>
                        <option value="skipped" ${seq.status === 'skipped' ? 'selected' : ''}>Skipped</option>
                        <option value="done" ${seq.status === 'done' ? 'selected' : ''}>Done</option>
                    </select>
                </div>
            `;
        }).join('');

        taskDisplay.innerHTML = `
            <div class="simple-list-view">
                <h4>${viewName} Sequences (${viewSequences.length} total)</h4>
                <div class="sequence-list-with-status">
                    ${sequenceList}
                </div>
            </div>
        `;

        // If we navigated here via navigateToSequence, scroll to and highlight the target
        if (this.navigatingToSequenceId) {
            const targetSequenceId = this.navigatingToSequenceId;
            setTimeout(() => {
                const targetElement = document.querySelector(`[data-sequence-id="${targetSequenceId}"]`);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetElement.classList.add('highlighted');
                    setTimeout(() => {
                        targetElement.classList.remove('highlighted');
                        this.navigatingToSequenceId = null; // Clear the flag after highlighting
                    }, 2000);
                } else {
                    this.navigatingToSequenceId = null; // Clear flag if element not found
                }
            }, 100);
        }
    }

    renderDetailedView() {
        const taskDisplay = document.getElementById('taskDisplay');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const taskCounter = document.getElementById('taskCounter');

        const viewSequences = this.getActiveSequences();
        
        if (viewSequences.length === 0) {
            taskDisplay.innerHTML = `
                <div class="empty-state">
                    <p>No active tasks found.</p>
                </div>
            `;
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            if (taskCounter) taskCounter.textContent = '';
            return;
        }

        // Show navigation
        if (prevBtn) {
            prevBtn.style.display = 'inline-block';
            prevBtn.disabled = false;
        }
        if (nextBtn) {
            nextBtn.style.display = 'inline-block';
            nextBtn.disabled = false;
        }

        // Ensure current index is valid
        const currentSequence = this.sequences[this.currentIndex];
        let currentViewIndex = viewSequences.findIndex(seq => seq.id === currentSequence?.id);
        
        if (currentViewIndex < 0) {
            const firstSequence = viewSequences[0];
            this.currentIndex = this.sequences.findIndex(seq => seq.id === firstSequence.id);
            currentViewIndex = 0;
        }

        const finalSequence = this.sequences[this.currentIndex];
        currentViewIndex = viewSequences.findIndex(seq => seq.id === finalSequence.id);

        // Update counter
        if (taskCounter) {
            taskCounter.textContent = `Task ${currentViewIndex + 1} of ${viewSequences.length}`;
        }

        // Update navigation buttons
        if (prevBtn) {
            prevBtn.disabled = currentViewIndex <= 0;
        }
        if (nextBtn) {
            nextBtn.disabled = currentViewIndex >= viewSequences.length - 1;
        }

        // Render full detailed view with all metadata (pulls from "All" tab data)
        const displaySequence = finalSequence;
        taskDisplay.innerHTML = `
            <div class="task-card">
                <div class="task-id">
                    <span class="task-id-label">Sequence ID</span>
                    ${displaySequence.id}
                </div>
                
                <div class="task-details">
                    <div class="detail-item">
                        <div class="detail-label">Features</div>
                        <div class="detail-value">${displaySequence.features ? this.calculateStats(displaySequence.features).features : (displaySequence.featureCount || 0)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Nodes</div>
                        <div class="detail-value">${displaySequence.features ? this.calculateStats(displaySequence.features).nodes : (displaySequence.nodeCount || 0)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Ways</div>
                        <div class="detail-value">${displaySequence.features ? this.calculateStats(displaySequence.features).ways : (displaySequence.wayCount || 0)}</div>
                    </div>
                </div>

                <div class="status-section">
                    <label class="status-label" for="statusDropdown">Status</label>
                    <select id="statusDropdown" class="status-dropdown" data-sequence-id="${displaySequence.id}">
                        <option value="" ${!displaySequence.status || displaySequence.status === '' ? 'selected' : ''}>Active (Blank)</option>
                        <option value="skipped" ${displaySequence.status === 'skipped' ? 'selected' : ''}>Skipped</option>
                        <option value="done" ${displaySequence.status === 'done' ? 'selected' : ''}>Done</option>
                    </select>
                </div>

                <div class="action-buttons">
                    <button class="action-btn btn-export" onclick="taskManager.exportToJOSM('${displaySequence.id}')">
                        📥 Export to JOSM
                    </button>
                    <button class="action-btn btn-preview" onclick="taskManager.previewSequence('${displaySequence.id}')">
                        👁️ Preview GeoJSON
                    </button>
                </div>
            </div>
        `;

        // Add event listener for status dropdown
        const statusDropdown = document.getElementById('statusDropdown');
        if (statusDropdown) {
            statusDropdown.addEventListener('change', (e) => {
                this.updateStatus(displaySequence.id, e.target.value);
            });
        }
    }

    findNextActiveIndex() {
        const activeSequences = this.getActiveSequences();
        if (activeSequences.length === 0) {
            this.currentIndex = 0;
            return;
        }

        // Find current sequence in active list
        const currentSequence = this.sequences[this.currentIndex];
        const currentActiveIndex = activeSequences.findIndex(seq => seq.id === currentSequence?.id);
        
        if (currentActiveIndex >= 0) {
            // Find the index in full sequences array
            this.currentIndex = this.sequences.findIndex(seq => seq.id === activeSequences[currentActiveIndex].id);
        } else {
            // Current is not active, find first active
            this.currentIndex = this.sequences.findIndex(seq => seq.id === activeSequences[0].id);
        }
    }


    async updateStatus(sequenceId, newStatus) {
        const sequence = this.sequences.find(s => String(s.id) === String(sequenceId));
        if (sequence) {
            sequence.status = newStatus;
            await this.saveToStorage();
            
            // If in 'all' view, stay in 'all' view (don't auto-switch)
            if (this.currentView === 'all') {
                // Stay in current view, just update
                this.renderCurrentTask();
            } else {
                // For other views, check if sequence should still be visible
                const viewSequences = this.getCurrentViewSequences();
                const stillInView = viewSequences.find(seq => seq.id === sequenceId);
                if (!stillInView && viewSequences.length > 0) {
                    // Current sequence no longer in view, go to first in view
                    const firstSequence = viewSequences[0];
                    this.currentIndex = this.sequences.findIndex(seq => seq.id === firstSequence.id);
                }
                this.renderCurrentTask();
            }
            
            this.updateSummary();
        }
    }

    showPrevious() {
        const viewSequences = this.getCurrentViewSequences();
        if (viewSequences.length === 0) return;

        const currentSequence = this.sequences[this.currentIndex];
        const currentViewIndex = viewSequences.findIndex(seq => String(seq.id) === String(currentSequence?.id));

        if (currentViewIndex > 0) {
            const prevSequence = viewSequences[currentViewIndex - 1];
            this.currentIndex = this.sequences.findIndex(seq => String(seq.id) === String(prevSequence.id));
            this.renderCurrentTask();
        }
    }

    showNext() {
        const viewSequences = this.getCurrentViewSequences();
        if (viewSequences.length === 0) return;

        const currentSequence = this.sequences[this.currentIndex];
        const currentViewIndex = viewSequences.findIndex(seq => String(seq.id) === String(currentSequence?.id));

        if (currentViewIndex < viewSequences.length - 1) {
            const nextSequence = viewSequences[currentViewIndex + 1];
            this.currentIndex = this.sequences.findIndex(seq => String(seq.id) === String(nextSequence.id));
            this.renderCurrentTask();
        }
    }

    async exportToJOSM(sequenceId) {
        const sequence = this.sequences.find(s => String(s.id) === String(sequenceId));
        if (!sequence) {
            alert('Sequence not found');
            return;
        }

        try {
            // Show loading message
            const fileInfo = document.getElementById('fileInfo');
            if (fileInfo) {
                fileInfo.textContent = 'Generating JOSM XML (fetching OSM data)...';
            }
            
            const josmXml = this.generateJOSM(sequence);
            
            // Validate XML before sending
            if (!josmXml || josmXml.trim().length === 0) {
                alert('Error: Generated OSM XML is empty. Please check your data.');
                if (fileInfo) fileInfo.textContent = '';
                return;
            }
            
            // Check if XML contains actual data (not just comments)
            if (!josmXml.includes('<node') && !josmXml.includes('<way')) {
                alert('Error: Generated OSM XML contains no nodes or ways. Please check your data.');
                if (fileInfo) fileInfo.textContent = '';
                return;
            }
            
            console.log('Generated OSM XML:', josmXml.substring(0, 500) + '...');
            if (fileInfo) fileInfo.textContent = '';
            await this.sendToJOSM(josmXml, sequenceId);
        } catch (error) {
            console.error('Export error:', error);
            alert(`Error exporting sequence: ${error.message}`);
            const fileInfo = document.getElementById('fileInfo');
            if (fileInfo) fileInfo.textContent = '';
        }
    }

    calculateBoundingBox(sequence) {
        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;
        
        sequence.features.forEach(feature => {
            if (!feature.geometry) return;
            const coords = this.extractCoordinates(feature.geometry);
            coords.forEach(coord => {
                const [lon, lat] = coord;
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
            });
        });
        
        // Add a small buffer (about 100 meters) to the bounding box
        const buffer = 0.001; // ~100 meters
        return {
            left: minLon - buffer,
            right: maxLon + buffer,
            top: maxLat + buffer,
            bottom: minLat - buffer
        };
    }

    async loadOsmDataForPreview(sequence) {
        try {
            // Calculate bounding box
            const bbox = this.calculateBoundingBox(sequence);
            
            // Remove existing OSM data layer if present
            if (this.osmDataLayer) {
                this.map.removeLayer(this.osmDataLayer);
                this.osmDataLayer = null;
            }
            
            // Create Overpass API query to get all ways and nodes in the bounding box
            const overpassQuery = `
                [out:xml][timeout:25];
                (
                  way["highway"](${bbox.bottom},${bbox.left},${bbox.top},${bbox.right});
                  relation["type"="route"]["route"~"^(bus|tram|train|subway|light_rail|trolleybus|ferry|monorail|aerialway|share_taxi|funicular)$"](${bbox.bottom},${bbox.left},${bbox.top},${bbox.right});
                );
                (._;>;);
                out body;
            `;
            
            // Fetch OSM data from Overpass API
            const overpassUrl = 'https://overpass-api.de/api/interpreter';
            console.log('Loading OSM data for preview...');
            
            const response = await fetch(overpassUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `data=${encodeURIComponent(overpassQuery)}`
            });
            
            if (!response.ok) {
                throw new Error(`Overpass API error: ${response.status}`);
            }
            
            const osmXml = await response.text();
            
            // Parse OSM XML and convert to GeoJSON
            const osmGeoJson = this.parseOsmXmlToGeoJson(osmXml);
            
            if (osmGeoJson && osmGeoJson.features && osmGeoJson.features.length > 0) {
                // Add OSM data as a layer with distinct styling (gray, thinner)
                this.osmDataLayer = L.geoJSON(osmGeoJson, {
                    style: (feature) => {
                        // Style OSM data differently from GPS trace
                        const highway = feature.properties?.highway;
                        let color = '#888888'; // Default gray
                        let weight = 2;
                        
                        // Color code by highway type
                        if (highway === 'motorway' || highway === 'trunk') {
                            color = '#ff6b6b';
                            weight = 3;
                        } else if (highway === 'primary') {
                            color = '#ffa500';
                            weight = 2.5;
                        } else if (highway === 'secondary') {
                            color = '#ffd700';
                            weight = 2;
                        } else if (highway === 'tertiary') {
                            color = '#90ee90';
                            weight = 2;
                        } else if (highway === 'residential' || highway === 'unclassified') {
                            color = '#c0c0c0';
                            weight = 1.5;
                        }
                        
                        return {
                            color: color,
                            weight: weight,
                            opacity: 0.6,
                            dashArray: '5, 5' // Dashed line to distinguish from GPS trace
                        };
                    },
                    onEachFeature: (feature, layer) => {
                        // Mark this layer as OSM data layer (read-only)
                        layer._isOsmDataLayer = true;
                        layer._isReadOnly = true; // Mark as read-only
                        // Store original feature for reference
                        layer.feature = feature;
                        // OSM data is read-only - make it non-interactive
                        layer.setStyle({ interactive: false });
                    }
                }).addTo(this.map);
                
                console.log(`Loaded ${osmGeoJson.features.length} OSM features for preview`);
            } else {
                console.log('No OSM data found in the area');
            }
        } catch (error) {
            console.warn('Failed to load OSM data for preview:', error);
            // Continue without OSM data - not critical
        }
    }

    parseOsmXmlToGeoJson(osmXml) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(osmXml, 'text/xml');
            
            // Check for parsing errors
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                throw new Error('XML parsing error');
            }
            
            const nodes = new Map();
            const ways = [];
            
            // Clear previous OSM data
            this.osmNodes.clear();
            this.osmWays = [];
            
            // PASS 1: Parse all nodes first (two-pass parsing for reliability)
            xmlDoc.querySelectorAll('node').forEach(nodeEl => {
                const id = nodeEl.getAttribute('id');
                const lat = parseFloat(nodeEl.getAttribute('lat'));
                const lon = parseFloat(nodeEl.getAttribute('lon'));
                
                // Skip invalid nodes
                if (isNaN(lat) || isNaN(lon) || !id) {
                    console.warn(`Skipping invalid node: ${id}`);
                    return;
                }
                
                const tags = {};
                nodeEl.querySelectorAll('tag').forEach(tag => {
                    const key = tag.getAttribute('k');
                    const value = tag.getAttribute('v');
                    if (key && value) {
                        tags[key] = value;
                    }
                });
                
                const nodeData = { id, lat, lon, tags };
                nodes.set(id, nodeData);
                // Store in osmNodes for snapping (consistent format)
                this.osmNodes.set(id, { lat, lon });
            });
            
            console.log(`Pass 1: Parsed ${nodes.size} OSM nodes`);
            
            // PASS 2: Parse ways (now we have all nodes available)
            xmlDoc.querySelectorAll('way').forEach(wayEl => {
                const id = wayEl.getAttribute('id');
                if (!id) return;
                
                const ndRefs = [];
                wayEl.querySelectorAll('nd').forEach(nd => {
                    const ref = nd.getAttribute('ref');
                    if (ref && nodes.has(ref)) {
                        ndRefs.push(ref);
                    } else if (ref) {
                        console.warn(`Way ${id} references missing node ${ref}`);
                    }
                });
                
                // Skip ways with less than 2 valid node references
                if (ndRefs.length < 2) {
                    console.warn(`Skipping way ${id}: insufficient nodes (${ndRefs.length})`);
                    return;
                }
                
                const tags = {};
                wayEl.querySelectorAll('tag').forEach(tag => {
                    const key = tag.getAttribute('k');
                    const value = tag.getAttribute('v');
                    if (key && value) {
                        tags[key] = value;
                    }
                });
                
                // Only include ways with highway tag (roads)
                if (tags.highway) {
                    // Build coordinates array in GeoJSON format [lon, lat]
                    const coordinates = ndRefs
                        .map(ref => {
                            const node = nodes.get(ref);
                            if (node) {
                                return [node.lon, node.lat]; // GeoJSON format: [lon, lat]
                            }
                            return null;
                        })
                        .filter(coord => coord !== null);
                    
                    // Store way data with consistent coordinate format
                    if (coordinates.length >= 2) {
                        // Store for snapping: convert to {lat, lon} objects for compatibility
                        const wayCoordsForSnapping = coordinates.map(coord => ({
                            lat: coord[1], // lat is second element in [lon, lat]
                            lon: coord[0]  // lon is first element in [lon, lat]
                        }));
                        
                        this.osmWays.push({
                            id: parseInt(id),
                            coordinates: wayCoordsForSnapping, // For snapping: {lat, lon} objects
                            coordinatesGeoJSON: coordinates,    // For GeoJSON: [lon, lat] arrays
                            tags
                        });
                        
                        ways.push({ id, ndRefs, tags, coordinates });
                    }
                }
            });
            
            console.log(`Pass 2: Parsed ${ways.length} OSM ways (${this.osmWays.length} with highway tag)`);
            
            // Convert ways to GeoJSON LineStrings
            const features = ways.map(way => {
                if (way.coordinates.length < 2) {
                    return null; // Skip invalid ways
                }
                
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: way.coordinates // Already in [lon, lat] format
                    },
                    properties: {
                        ...way.tags,
                        osm_id: way.id
                    }
                };
            }).filter(f => f !== null);
            
            console.log(`Parsed ${this.osmNodes.size} OSM nodes and ${this.osmWays.length} OSM ways for snapping`);
            
            return {
                type: 'FeatureCollection',
                features: features
            };
        } catch (error) {
            console.error('Error parsing OSM XML:', error);
            return { type: 'FeatureCollection', features: [] };
        }
    }

    async sendToJOSM(josmXml, sequenceId) {
        // Re-detect helper in case it wasn't detected on startup
        await this.detectLocalHelper();
        
        // First, check if JOSM is running and accessible
        let josmRunning = false;
        try {
            const versionResponse = await fetch('http://localhost:8111/version', {
                method: 'GET',
                mode: 'no-cors',
                cache: 'no-cache'
            });
            josmRunning = true;
            console.log('✅ JOSM Remote Control is accessible');
        } catch (error) {
            console.warn('⚠️ JOSM connectivity check failed (this is OK if JOSM is starting):', error);
            // Continue anyway - JOSM might be starting up
        }
        
        console.log('Sending to JOSM:', {
            xmlLength: josmXml.length,
            helperUrl: this.localHelperUrl,
            josmRunning: josmRunning
        });
        
        // Get the sequence to calculate bounding box
        const sequence = this.sequences.find(s => String(s.id) === String(sequenceId));
        
        // Use server-side export + JOSM import endpoint (most reliable)
        // This avoids URL length limits and encoding issues
        const exportServerUrl = this.getExportServerUrl();
        
        // If no server available, fall back to download mode
        if (!exportServerUrl) {
            console.log('⚠️ No local helper server available - downloading file instead');
            this.downloadFile(josmXml, `sequence_${sequenceId}.osm`, 'application/xml');
            alert('File downloaded! Open it manually in JOSM.\n\nTip: Make sure the JOSM Helper is running (port 8001) for direct export.');
            return;
        }
        
        try {
            console.log('📤 Step 1: Uploading GPS trace OSM XML to helper server...');
            
            // POST the OSM XML to our helper server
            const response = await fetch(`${exportServerUrl}/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sequenceId: sequenceId,
                    osmXml: josmXml
                })
            });
            
            if (!response.ok) {
                throw new Error(`Helper server error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (!result.success || !result.url) {
                throw new Error('Helper server did not return file URL');
            }
            
            console.log('✅ Step 2: File saved at:', result.url);
            
            // Download OSM data for context (if sequence available)
            if (sequence) {
                try {
                    const bbox = this.calculateBoundingBox(sequence);
                    console.log('📥 Step 3: Downloading OSM data for context (bbox:', bbox, ')');
                    
                    // Use JOSM's load_and_zoom endpoint to download OSM data
                    const loadUrl = `http://localhost:8111/load_and_zoom?left=${bbox.left}&right=${bbox.right}&top=${bbox.top}&bottom=${bbox.bottom}`;
                    
                    // Use iframe to trigger OSM data download (bypasses CORS)
                    const osmIframe = document.createElement('iframe');
                    osmIframe.style.display = 'none';
                    osmIframe.src = loadUrl;
                    document.body.appendChild(osmIframe);
                    
                    // Wait for OSM data to load
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Clean up iframe
                    document.body.removeChild(osmIframe);
                    console.log('✅ OSM context data loaded');
                } catch (error) {
                    console.warn('⚠️ Failed to download OSM context data, continuing with GPS trace only:', error);
                }
            }
            
            console.log('📥 Step 4: Importing GPS trace into JOSM...');
            
            // Send to JOSM using iframe (more reliable than fetch for JOSM Remote Control)
            // new_layer=false merges GPS trace into the existing OSM data layer
            const josmImportUrl = `http://localhost:8111/import?new_layer=false&url=${encodeURIComponent(result.url)}`;
            console.log('JOSM import URL:', josmImportUrl);
            
            // Create hidden iframe to trigger JOSM import
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = josmImportUrl;
            document.body.appendChild(iframe);
            
            console.log('✅ JOSM import request sent');
            
            // Focus JOSM window IMMEDIATELY (before waiting for import to complete)
            // This ensures JOSM comes to foreground right away
            console.log('🎯 Step 4: Focusing JOSM window immediately...');
            await this.blurBrowserForJOSM();
            
            // Wait for JOSM to load the data (longer delay to ensure import completes)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Focus again after a moment (Windows sometimes needs multiple attempts)
            console.log('🎯 Focusing JOSM window again...');
            await this.blurBrowserForJOSM();
            
            // Clean up iframe
            document.body.removeChild(iframe);
            
            // Wait a bit more for import to fully complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Zoom JOSM to the loaded data (optional - skip if it fails)
            try {
                // Try zoom endpoint - if it fails, that's OK, data is already loaded
                const zoomIframe = document.createElement('iframe');
                zoomIframe.style.display = 'none';
                zoomIframe.src = 'http://localhost:8111/zoom';
                document.body.appendChild(zoomIframe);
                setTimeout(() => {
                    try {
                        document.body.removeChild(zoomIframe);
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }, 500);
            } catch (error) {
                // Zoom is optional - data is already loaded, so ignore errors
                console.log('ℹ️ Zoom skipped (optional feature)');
            }
            
            // Final focus attempt to ensure JOSM stays in foreground
            console.log('🎯 Final focus attempt...');
            await this.blurBrowserForJOSM();
            
            console.log('✅ Export complete! Data sent to JOSM.');
            return;
            
        } catch (error) {
            console.error('❌ Server-based export failed:', error);
            console.log('Falling back to direct download...');
            
            // Fallback: direct file download
            this.downloadFile(josmXml, `sequence_${sequenceId}.osm`, 'application/xml');
            alert(`Export failed: ${error.message}\n\nFile downloaded instead. Please open it manually in JOSM.`);
        }
    }
    
    async blurBrowserForJOSM() {
        // Call server endpoint to focus JOSM using Windows API
        console.log('🎯 Requesting server to focus JOSM window...');
        
        // Try helper first (port 8001), then main server (port 8000)
        const focusUrls = [];
        if (this.localHelperUrl) {
            focusUrls.push(`${this.localHelperUrl}/focus-josm`);
        }
        // Also try the helper port directly
        focusUrls.push('http://localhost:8001/focus-josm');
        // And the main server
        if (this.isLocalMode) {
            focusUrls.push('http://localhost:8000/focus-josm');
        }
        
        let focused = false;
        for (const focusUrl of focusUrls) {
            try {
                console.log(`Trying focus endpoint: ${focusUrl}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                const response = await fetch(focusUrl, {
                    signal: controller.signal,
                    method: 'GET',
                    mode: 'cors'
                });
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        console.log('✅ JOSM window focused successfully via', focusUrl);
                        focused = true;
                        break;
                    } else {
                        console.log(`⚠️ Focus endpoint responded but JOSM not found: ${focusUrl}`);
                    }
                }
            } catch (error) {
                // Try next URL
                console.log(`Focus endpoint failed: ${focusUrl}`, error.message);
                continue;
            }
        }
        
        if (!focused) {
            console.warn('⚠️ Could not focus JOSM via server. Is JOSM running?');
            // Fallback: try browser blur (minimal effect but might help)
            try {
                window.blur();
            } catch (e) {
                // Ignore blur errors
            }
        }
    }
    
    async detectLocalHelper() {
        // Try to detect if local JOSM helper is running (port 8001)
        const helperUrl = `http://localhost:${this.localHelperPort}`;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            
            const response = await fetch(`${helperUrl}/ping`, {
                signal: controller.signal,
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                if (data.service === 'josm-helper') {
                    this.localHelperUrl = helperUrl;
                    console.log('✅ Local JOSM helper detected at', helperUrl);
                    this.showHelperStatus(true);
                    return true;
                }
            }
        } catch (error) {
            // Helper not available - this is fine for GitHub Pages mode
            console.log('ℹ️ JOSM helper not detected at port 8001 (this is normal if helper is not running)');
        }
        
        // Also check if running on localhost with main server (port 8000)
        if (this.isLocalMode) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);
                
                const response = await fetch('http://localhost:8000/exports/', {
                    signal: controller.signal,
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache'
                });
                clearTimeout(timeoutId);
                
                if (response.ok || response.status === 404) {
                    // Main server is running locally
                    this.localHelperUrl = 'http://localhost:8000';
                    console.log('✅ Running in local mode with main server at port 8000');
                    this.showHelperStatus(true);
                    return true;
                }
            } catch (error) {
                // Main server not available
                console.log('ℹ️ Main server not detected at port 8000');
            }
        }
        
        this.localHelperUrl = null;
        this.showHelperStatus(false);
        return false;
    }
    
    showHelperStatus(connected) {
        // Optional: Show connection status in UI
        // You can add a status indicator in the header if desired
        if (!this.isLocalMode && !connected) {
            console.log('📥 Running in online mode - exports will download as files');
        }
    }
    
    getExportServerUrl() {
        // Return the appropriate server URL for exports
        if (this.localHelperUrl) {
            return this.localHelperUrl;
        }
        // Fallback for local development
        if (this.isLocalMode) {
            return 'http://localhost:8000';
        }
        return null; // No server available - will trigger download mode
    }
    
    async triggerJOSMMerge(mergedOsmNodeIds) {
        // Wait a bit for JOSM to fully load the data
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            // JOSM Remote Control API: Select nodes and merge them
            // Method 1: Try to select nodes by ID and execute merge command
            const nodeSelectors = mergedOsmNodeIds.map(id => `node${id}`).join(',');
            
            // First, try to select the nodes
            console.log('Selecting merged nodes in JOSM:', nodeSelectors);
            const selectUrl = `http://localhost:8111/select?objects=${encodeURIComponent(nodeSelectors)}`;
            
            const selectIframe = document.createElement('iframe');
            selectIframe.style.display = 'none';
            selectIframe.style.width = '0';
            selectIframe.style.height = '0';
            selectIframe.src = selectUrl;
            document.body.appendChild(selectIframe);
            
            // Wait a bit, then try to execute merge command
            setTimeout(() => {
                document.body.removeChild(selectIframe);
                
                // Try to execute merge command via JOSM Remote Control
                // Note: JOSM Remote Control may not support direct merge command execution
                // This is experimental - JOSM might require manual merge
                console.log('Attempting to trigger merge command in JOSM...');
                
                // Alternative: Use JOSM's exec endpoint if available
                // Format: /exec?command=merge
                const execUrl = `http://localhost:8111/exec?command=merge`;
                const execIframe = document.createElement('iframe');
                execIframe.style.display = 'none';
                execIframe.style.width = '0';
                execIframe.style.height = '0';
                execIframe.src = execUrl;
                document.body.appendChild(execIframe);
                
                setTimeout(() => {
                    document.body.removeChild(execIframe);
                    console.log('Merge command triggered (if supported by JOSM)');
                }, 1000);
                
            }, 1000);
            
        } catch (error) {
            console.warn('Failed to trigger automatic merge via JOSM Remote Control:', error);
            console.log('You may need to manually merge nodes in JOSM (Ctrl+M)');
        }
    }
    
    downloadAndOpenInJOSM(josmXml, sequenceId) {
        // Download the file
        this.downloadFile(josmXml, `sequence_${sequenceId}.osm`, 'application/xml');
        
        // Provide helpful instructions
        alert('📥 File downloaded!\n\n' +
              'To open in JOSM:\n' +
              '1. Go to JOSM\n' +
              '2. File → Open (or press Ctrl+O)\n' +
              '3. Navigate to your Downloads folder\n' +
              '4. Select: sequence_' + sequenceId + '.osm\n' +
              '5. Click Open\n\n' +
              'Or simply drag and drop the file into JOSM!');
    }

    generateJOSM(sequence) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
            xml += '<osm version="0.6" generator="OSMAGIC Task Manager">\n';
        xml += `  <!-- Sequence ID: ${sequence.id} -->\n`;
        xml += `  <!-- Features: ${sequence.featureCount} -->\n`;
        xml += `  <!-- Generated: ${new Date().toISOString()} -->\n\n`;

        let nodeId = -1000;
        let wayId = -1000;
        const nodeMap = new Map();
        
        // Build coordinate-to-marker mapping from editableLayers to access merge information
        // Use a list of markers with coordinates for tolerance-based matching
        const markerList = [];
        const coordTolerance = 0.00001; // ~1 meter tolerance for coordinate matching
        
        if (this.editableLayers && this.editableLayers.length > 0) {
            this.editableLayers.forEach(layer => {
                // Only process GPS trace layers (not OSM data layers)
                if (layer._isGpsTrace && (layer instanceof L.Polyline || layer instanceof L.Polygon)) {
                    const latlngs = this.flattenLatLngs(layer.getLatLngs());
                    const markers = layer._vertexMarkers || [];
                    
                    latlngs.forEach((latlng, index) => {
                        if (latlng && (latlng instanceof L.LatLng || (latlng.lat !== undefined && latlng.lng !== undefined))) {
                            const lat = latlng.lat || latlng[0];
                            const lng = latlng.lng || latlng[1];
                            
                            // Get corresponding marker if available
                            const marker = markers[index];
                            if (marker) {
                                markerList.push({
                                    lat: lat,
                                    lon: lng,
                                    marker: marker
                                });
                            }
                        }
                    });
                }
            });
        }
        
        // Helper function to find nearest marker for a coordinate
        const findMarkerForCoord = (lat, lon) => {
            let nearestMarker = null;
            let minDistance = Infinity;
            
            markerList.forEach(item => {
                const distance = Math.sqrt(
                    Math.pow(item.lat - lat, 2) + Math.pow(item.lon - lon, 2)
                );
                if (distance < minDistance && distance <= coordTolerance) {
                    minDistance = distance;
                    nearestMarker = item.marker;
                }
            });
            
            return nearestMarker;
        };

        // Process features and create nodes
        sequence.features.forEach(feature => {
            if (!feature.geometry) return;

            const coords = this.extractCoordinates(feature.geometry);
            
            coords.forEach(coord => {
                const [lon, lat] = coord;
                const key = `${lat.toFixed(7)},${lon.toFixed(7)}`;
                
                if (!nodeMap.has(key)) {
                    // Simple node mapping - no merge logic
                    nodeMap.set(key, {
                        id: nodeId--,
                        lat: lat,
                        lon: lon
                    });
                }
            });
        });

        // Write nodes - simple export, no merge logic
        nodeMap.forEach(node => {
                xml += `  <node id="${node.id}" lat="${node.lat.toFixed(7)}" lon="${node.lon.toFixed(7)}" version="1" />\n`;
        });

        xml += '\n';

        // Process features and create ways
        sequence.features.forEach(feature => {
            if (!feature.geometry) return;

            const coords = this.extractCoordinates(feature.geometry);
            if (coords.length < 2) return; // Skip points for ways

            xml += `  <way id="${wayId--}" version="1">\n`;

            coords.forEach(coord => {
                const [lon, lat] = coord;
                const key = `${lat.toFixed(7)},${lon.toFixed(7)}`;
                const node = nodeMap.get(key);
                if (node) {
                    // Reference the node (either new negative ID or existing OSM positive ID)
                    xml += `    <nd ref="${node.id}" />\n`;
                }
            });

            // Add highway tag
            const highwayValue = feature.properties?.highway || 'unclassified';
            xml += `    <tag k="highway" v="${this.escapeXml(String(highwayValue))}" />\n`;
            
            // Add oneway tag if present
            const onewayValue = feature.properties?.oneway;
            if (onewayValue && onewayValue !== '' && onewayValue !== 'no') {
                xml += `    <tag k="oneway" v="${this.escapeXml(String(onewayValue))}" />\n`;
            }
            
            xml += `  </way>\n`;
        });

        xml += '</osm>';
        return xml;
    }

    extractCoordinates(geometry) {
        const coords = [];

        if (geometry.type === 'Point') {
            coords.push(geometry.coordinates);
        } else if (geometry.type === 'LineString') {
            coords.push(...geometry.coordinates);
        } else if (geometry.type === 'Polygon') {
            if (geometry.coordinates && geometry.coordinates[0]) {
                coords.push(...geometry.coordinates[0]);
            }
        } else if (geometry.type === 'MultiLineString') {
            geometry.coordinates.forEach(line => {
                coords.push(...line);
            });
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(polygon => {
                if (polygon[0]) {
                    coords.push(...polygon[0]);
                }
            });
        }

        return coords;
    }

    escapeXml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async previewSequence(sequenceId) {
        const sequence = this.sequences.find(s => String(s.id) === String(sequenceId));
        if (!sequence) {
            alert('Sequence not found');
            return;
        }

        this.currentPreviewSequence = sequence;
        this.previewEditMode = false;
        this.originalPreviewFeatures = JSON.parse(JSON.stringify(sequence.features)); // Deep copy for revert
        this.editableLayers = [];
        
        document.getElementById('previewSequenceId').textContent = sequenceId;
        
        // Reset workflow
        this.workflowStep = 'preview';
        this.workflowCompleted = {
            preview: true,
            edit: false,
            split: false,
            tag: false
        };
        this.updateWorkflowUI();
        
        // Reset way selection
        this.selectedWayLayer = null;
        this.waySegments.clear();
        
        // Initialize relations for this sequence (reset if switching sequences)
        if (!this.relations || this.relations.length === 0) {
            this.relations = [];
            this.nextRelationId = -1;
        }
        
        // Hide tag editor panel initially (will show in tag step)
        const tagEditorPanel = document.getElementById('tagEditorPanel');
        if (tagEditorPanel) {
            tagEditorPanel.style.display = 'none';
        }
        
        // Clear any selected way in preview step (view-only, no way selection)
        this.selectedWayLayer = null;
        
        // Update selected way info
        this.updateSelectedWayInfo();
        
        // Reset edit mode UI
        // Only show edit mode button if in edit step (step 2)
        if (this.workflowStep === 'edit') {
        document.getElementById('toggleEditModeBtn').style.display = 'inline-block';
        document.getElementById('toggleEditModeBtn').textContent = '✏️ Enable Edit Mode';
        } else {
            // Hide in preview step (step 1)
            document.getElementById('toggleEditModeBtn').style.display = 'none';
        }
        // Save/Revert buttons removed - edits autosave on export
        
        
        // Show modal
        const modal = document.getElementById('previewModal');
        modal.style.display = 'block';

        // Initialize map - need to wait a bit for modal to be visible
        setTimeout(() => {
            if (!this.map) {
                // Default to Singapore coordinates (as per user preference)
                this.map = L.map('previewMap', {
                    zoomControl: true,
                    maxZoom: 22,  // Allow higher zoom levels for detailed editing
                    preferCanvas: true,  // Use canvas renderer for better performance
                    renderer: L.canvas({ padding: 0.5 })  // Optimize rendering
                }).setView([1.301965, 103.9003035], 13);
                
                // Add OpenStreetMap tile layer with overzooming support
                // maxNativeZoom: 19 means tiles are available up to zoom 19
                // maxZoom: 22 allows the map to zoom further by scaling tiles
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxNativeZoom: 19,  // Native tile zoom level
                    maxZoom: 22,  // Allow overzooming (scaling tiles beyond native zoom)
                    tileSize: 256,
                    zoomOffset: 0
                }).addTo(this.map);
            }

            // Clear existing GeoJSON layers (but keep tile layer and OSM data layer)
            this.map.eachLayer((layer) => {
                if (layer instanceof L.GeoJSON || layer instanceof L.Polyline || layer instanceof L.Polygon || layer instanceof L.Marker) {
                    if (!(layer instanceof L.TileLayer) && !layer._isOsmDataLayer) {
                        this.map.removeLayer(layer);
                    }
                }
            });
            this.editableLayers = [];
            
            // Load OSM data for the area (async, will add to editableLayers when loaded)
            this.loadOsmDataForPreview(sequence).then(() => {
                // OSM data is loaded but NOT added to editable layers (read-only)
                // It remains visible for reference but cannot be edited
                if (this.osmDataLayer) {
                    console.log('OSM data loaded (read-only, not editable)');
                }
            });

            // Create GeoJSON from sequence features
            const geojson = {
                type: 'FeatureCollection',
                features: sequence.features
            };

            // Add GeoJSON layer to map with blue lines (as per user preference)
            const geoJsonLayer = L.geoJSON(geojson, {
                style: (feature) => {
                    return {
                        color: '#0066ff', // Blue color as per user preference
                        weight: 4,
                        opacity: 0.8
                    };
                },
                onEachFeature: (feature, layer) => {
                    // No popup - user doesn't want property popups
                }
            }).addTo(this.map);

            // Store layers for editing (GPS trace)
            geoJsonLayer.eachLayer((layer) => {
                // Store the actual layer (Polyline, Polygon, or Marker)
                this.editableLayers.push(layer);
                // Also store reference to the feature for later use
                layer.feature = layer.feature || {};
                layer._isGpsTrace = true; // Mark as GPS trace
                
                    // Add click handler for way selection (only for polylines/polygons)
                    if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
                        layer.on('click', (e) => {
                            // Allow way selection in tag step, or if not in preview step and not in edit mode
                            if ((this.workflowStep === 'tag') || (this.workflowStep !== 'preview' && !this.previewEditMode)) {
                                if (!e.originalEvent.target.closest('.vertex-marker')) {
                                    const addToSelection = this.multiSelectMode && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);
                                    this.selectWay(layer, addToSelection);
                                    e.originalEvent.stopPropagation();
                                }
                            }
                        });
                        
                        // Add context menu
                        layer.on('contextmenu', (e) => {
                            if (this.previewEditMode) {
                                this.showContextMenu(e.originalEvent, layer);
                            }
                        });
                    
                    // Add hover effect for way selection (enabled in tag step)
                    layer.on('mouseover', () => {
                        // Show hover effect in tag step, or if not in preview step and not in edit/split mode
                        if (this.workflowStep === 'tag' || (this.workflowStep !== 'preview' && !this.previewEditMode && !this.splitMode)) {
                            layer.setStyle({ 
                                weight: layer.options.weight + 2, 
                                opacity: 1.0 
                            });
                        }
                    });
                    
                    layer.on('mouseout', () => {
                        // Restore style in tag step, or if not in preview step and not in edit/split mode
                        if (this.workflowStep === 'tag' || (this.workflowStep !== 'preview' && !this.previewEditMode && !this.splitMode)) {
                            if (this.selectedWayLayer === layer) {
                                // Keep selected style
                                layer.setStyle({ 
                                    weight: 6, 
                                    opacity: 0.9,
                                    color: '#0066ff',
                                    dashArray: '5, 5'
                                });
                            } else {
                                // Restore original style
                                layer.setStyle({ 
                                    weight: 4, 
                                    opacity: 0.8,
                                    color: '#0066ff'
                                });
                            }
                        }
                    });
                }
            });
            
            // Render oneway arrows if oneway tags exist
            setTimeout(() => {
                this.updateOnewayArrows();
            }, 500);
            
            // OSM data layers are NOT added to editable layers (read-only)
            // They remain visible for reference but cannot be edited
            
            // Debug: log what we found
            console.log('Editable layers found:', this.editableLayers.length);
            this.editableLayers.forEach((layer, idx) => {
                console.log(`Layer ${idx}:`, layer.constructor.name, layer instanceof L.Polyline, layer instanceof L.Polygon, layer instanceof L.Marker, 'GPS:', layer._isGpsTrace, 'OSM:', layer._isOsmData);
            });

            // Invalidate size to ensure map renders correctly
            setTimeout(() => {
                this.map.invalidateSize();
                
                // Fit map to bounds
                if (geoJsonLayer.getBounds().isValid()) {
                    this.map.fitBounds(geoJsonLayer.getBounds(), { padding: [50, 50] });
                } else {
                    // Fallback to Singapore if bounds are invalid
                    this.map.setView([1.301965, 103.9003035], 13);
                }
            }, 200);
        }, 300);
    }

    toggleEditMode() {
        this.previewEditMode = !this.previewEditMode;
        
        if (this.previewEditMode) {
            // Disable map dragging when edit mode is enabled to prevent conflicts with node/way dragging
            // Users can still pan by clicking and dragging on empty map areas (we'll handle this separately if needed)
            this.map.dragging.disable();
            
            // Filter out OSM data layers from editable layers (they are read-only)
            // Only GPS trace layers should be editable
            this.editableLayers = this.editableLayers.filter(layer => 
                layer._isGpsTrace && !layer._isOsmDataLayer && !layer._isReadOnly
            );
            
            // Check if we have layers to edit (only GPS trace layers)
            if (!this.editableLayers || this.editableLayers.length === 0) {
                alert('No GPS trace geometry found to edit. Make sure the sequence has features.');
                this.previewEditMode = false;
                this.map.dragging.enable(); // Re-enable if we're not entering edit mode
                return;
            }
            
            console.log('Enabling edit mode for', this.editableLayers.length, 'GPS trace layers (OSM data is read-only)');
            
            // Initialize undo/redo history
            this.initializeHistory();
            
            // Show edit mode buttons (simplified - only essential functions)
            document.getElementById('selectionInfo').style.display = 'block';
            
            // Enable editing - add draggable vertex markers (only for GPS trace layers)
            let layersProcessed = 0;
            this.editableLayers.forEach((layer, idx) => {
                // Skip OSM data layers (read-only)
                if (layer._isOsmDataLayer || layer._isReadOnly) {
                    console.log(`Layer ${idx}: Skipping OSM data layer (read-only)`);
                    return;
                }
                
                console.log(`Layer ${idx}:`, layer.constructor.name, 'has getLatLngs:', typeof layer.getLatLngs === 'function');
                
                // Check if it's a polyline or polygon (more flexible check)
                const isPolyline = layer instanceof L.Polyline || (layer.getLatLngs && !(layer instanceof L.Marker) && !(layer instanceof L.Circle));
                const isPolygon = layer instanceof L.Polygon;
                
                if (isPolyline || isPolygon) {
                    console.log(`  - Processing as ${isPolygon ? 'Polygon' : 'Polyline'} (GPS trace)`);
                    layersProcessed++;
                    // Make the layer more visible when editing and make it draggable
                    layer.setStyle({ 
                        weight: 6, 
                        opacity: 0.9, 
                        cursor: 'move',
                        color: '#0066ff',
                        dashArray: null // Solid line in edit mode
                    });
                    
                    // Add hover effect for better visual feedback
                    layer.on('mouseover', () => {
                        if (!layer._isDragging) {
                            layer.setStyle({ 
                                weight: 7, 
                                opacity: 1.0,
                                color: '#0052cc'
                            });
                        }
                    });
                    
                    layer.on('mouseout', () => {
                        if (!layer._isDragging) {
                            layer.setStyle({ 
                                weight: 6, 
                                opacity: 0.9,
                                color: '#0066ff'
                            });
                        }
                    });
                    
                    // Store reference to layer for dragging
                    layer._isDragging = false;
                    layer._dragStart = null;
                    layer._originalLatLngs = null;
                    
                    // Enable dragging the entire way by clicking on the line
                    // Use a flag to track if mouse is down on the path
                    layer._mouseDownOnPath = false;
                    layer._wayDragStartLatLng = null;
                    
                    layer.on('mousedown', (e) => {
                        // Check if clicking directly on the path element (not on markers)
                        const target = e.originalEvent.target;
                        const isOnMarker = target.closest('.vertex-marker') || target.closest('.delete-node-btn') || target.closest('.leaflet-marker-icon');
                        
                        if (!isOnMarker) {
                            // Store mouse down position for click detection
                            layer._lastMouseDownPos = {
                                x: e.originalEvent.clientX,
                                y: e.originalEvent.clientY
                            };
                            
                            layer._mouseDownOnPath = true;
                            layer._isDragging = true;
                            layer._wayDragStartLatLng = e.latlng; // Store initial click position
                            layer._originalLatLngs = this.flattenLatLngs(layer.getLatLngs());
                            // Map dragging is already disabled in edit mode, but ensure it stays disabled
                            this.map.dragging.disable();
                            L.DomEvent.stopPropagation(e);
                            L.DomEvent.preventDefault(e);
                        }
                    });
                    
                    // Handle mouse move for dragging entire way
                    // Optimized with requestAnimationFrame for smooth performance
                    let wayDragRafId = null;
                    const dragHandler = (e) => {
                        if (layer._isDragging && layer._wayDragStartLatLng && layer._mouseDownOnPath && layer._originalLatLngs) {
                            // Cancel any pending updates
                            if (wayDragRafId) {
                                cancelAnimationFrame(wayDragRafId);
                            }
                            
                            // Use requestAnimationFrame to batch updates
                            wayDragRafId = requestAnimationFrame(() => {
                                // Calculate delta from the original click position, not from last position
                                const deltaLat = e.latlng.lat - layer._wayDragStartLatLng.lat;
                                const deltaLng = e.latlng.lng - layer._wayDragStartLatLng.lng;
                                
                                // Apply delta to original positions
                                const newLatLngs = layer._originalLatLngs.map(ll => {
                                    if (ll instanceof L.LatLng) {
                                        return L.latLng(ll.lat + deltaLat, ll.lng + deltaLng);
                                    } else if (Array.isArray(ll)) {
                                        return L.latLng(ll[0] + deltaLat, ll[1] + deltaLng);
                                    }
                                    return L.latLng((ll.lat || ll[0]) + deltaLat, (ll.lng || ll[1]) + deltaLng);
                                });
                                
                                // Update layer without triggering events that might cause feedback
                                layer.setLatLngs(layer instanceof L.Polygon ? [newLatLngs] : newLatLngs);
                                
                                // Update vertex markers in real-time during drag for visual feedback
                                // Update marker positions directly (synchronously) so they move with the way
                                if (layer._vertexMarkers && layer._vertexMarkers.length === newLatLngs.length) {
                                    // Update existing markers directly for immediate visual feedback
                                    newLatLngs.forEach((latlng, index) => {
                                        if (layer._vertexMarkers[index]) {
                                            let lat, lng;
                                            if (latlng instanceof L.LatLng) {
                                                lat = latlng.lat;
                                                lng = latlng.lng;
                                            } else if (Array.isArray(latlng)) {
                                                lat = latlng[0];
                                                lng = latlng[1];
                                            } else {
                                                lat = latlng.lat || latlng[0];
                                                lng = latlng.lng || latlng[1];
                                            }
                                            layer._vertexMarkers[index].setLatLng([lat, lng]);
                                        }
                                    });
                                } else {
                                    // If marker count doesn't match, recreate markers (shouldn't happen during drag)
                                    if (!layer._updatingMarkers) {
                                        layer._updatingMarkers = true;
                                        this.updateVertexMarkers(layer, newLatLngs);
                                        layer._updatingMarkers = false;
                                    }
                                }
                                
                                wayDragRafId = null;
                            });
                        }
                    };
                    
                    // Handle mouse up for dragging entire way
                    const dragEndHandler = () => {
                        if (layer._isDragging) {
                            layer._isDragging = false;
                            layer._mouseDownOnPath = false;
                            layer._wayDragStartLatLng = null;
                            
                            // Visual feedback: restore way styling
                            layer.setStyle({ 
                                weight: 6, 
                                opacity: 0.9,
                                color: '#0066ff'
                            });
                            
                            // Final update of markers
                            if (layer._originalLatLngs) {
                                const currentLatLngs = this.flattenLatLngs(layer.getLatLngs());
                                this.updateVertexMarkers(layer, currentLatLngs);
                            }
                            
                            layer._originalLatLngs = null;
                            
                            // Save state after way drag completes
                            this.saveStateToHistory();
                            
                            // Map dragging stays disabled in edit mode (we'll re-enable when exiting edit mode)
                        }
                    };
                    
                    this.map.on('mousemove', dragHandler);
                    this.map.on('mouseup', dragEndHandler);
                    this.map.on('mouseleave', dragEndHandler); // Also handle mouse leaving map
                    
                    // Store handlers for cleanup
                    layer._dragHandler = dragHandler;
                    layer._dragEndHandler = dragEndHandler;
                    
                    // Visual feedback for adding nodes: show preview marker on hover
                    let previewMarker = null;
                    layer.on('mousemove', (e) => {
                        // Don't show preview if dragging or clicking
                        if (layer._isDragging || layer._mouseDownOnPath) return;
                        
                        // Check if hovering over the line (not markers)
                        const target = e.originalEvent.target;
                        const isOnMarker = target.closest('.vertex-marker') || target.closest('.delete-node-btn') || target.closest('.leaflet-marker-icon');
                        if (isOnMarker) {
                            if (previewMarker) {
                                this.map.removeLayer(previewMarker);
                                previewMarker = null;
                            }
                            return;
                        }
                        
                        // Show preview marker at hover position
                        if (!previewMarker) {
                            previewMarker = L.marker(e.latlng, {
                                icon: L.divIcon({
                                    className: 'vertex-marker',
                                    html: '<div class="vertex-handle" style="background: #ffaa00; opacity: 0.7; border: 2px dashed #ffffff;"></div>',
                                    iconSize: [14, 14],
                                    iconAnchor: [7, 7]
                                }),
                                zIndexOffset: 1050,
                                interactive: false
                            }).addTo(this.map);
                        } else {
                            previewMarker.setLatLng(e.latlng);
                        }
                    });
                    
                    layer.on('mouseout', () => {
                        if (previewMarker) {
                            this.map.removeLayer(previewMarker);
                            previewMarker = null;
                        }
                    });
                    
                    // Add node by clicking on the line
                    layer.on('click', (e) => {
                        // Remove preview marker
                        if (previewMarker) {
                            this.map.removeLayer(previewMarker);
                            previewMarker = null;
                        }
                        
                        // Don't add node if currently dragging the way or clicked on marker
                        if (layer._isDragging || 
                            e.originalEvent.target.closest('.vertex-marker') || 
                            e.originalEvent.target.closest('.delete-node-btn') ||
                            e.originalEvent.target.closest('.leaflet-marker-icon')) {
                            return;
                        }
                        
                        // Check if this was a drag (mouse moved significantly) - if so, don't add node
                        // Use a small delay to distinguish between click and drag
                        const clickTime = Date.now();
                        if (layer._lastMouseDownTime && (clickTime - layer._lastMouseDownTime < 200)) {
                            // Check if mouse moved significantly
                            if (layer._lastMouseDownPos) {
                                const dx = Math.abs(e.originalEvent.clientX - layer._lastMouseDownPos.x);
                                const dy = Math.abs(e.originalEvent.clientY - layer._lastMouseDownPos.y);
                                if (dx > 5 || dy > 5) {
                                    // This was a drag, not a click
                                    return;
                                }
                            }
                        }
                        
                        const clickLatLng = e.latlng;
                        const latlngs = this.flattenLatLngs(layer.getLatLngs());
                        
                        // Find the closest segment
                        let minDistance = Infinity;
                        let insertIndex = -1;
                        
                        for (let i = 0; i < latlngs.length - 1; i++) {
                            const segStart = latlngs[i];
                            const segEnd = latlngs[i + 1];
                            const startLL = segStart instanceof L.LatLng ? segStart : L.latLng(segStart[0] || segStart.lat, segStart[1] || segStart.lng);
                            const endLL = segEnd instanceof L.LatLng ? segEnd : L.latLng(segEnd[0] || segEnd.lat, segEnd[1] || segEnd.lng);
                            const distance = this.distanceToSegment(clickLatLng, startLL, endLL);
                            
                            if (distance < minDistance) {
                                minDistance = distance;
                                insertIndex = i + 1;
                            }
                        }
                        
                        // Insert new node with visual feedback
                        if (insertIndex > 0) {
                            // Save state before adding node
                            this.saveStateToHistory();
                            
                            latlngs.splice(insertIndex, 0, clickLatLng);
                            layer.setLatLngs(layer instanceof L.Polygon ? [latlngs] : latlngs);
                            
                            // Brief visual feedback: highlight the new node
                            this.updateVertexMarkers(layer, latlngs);
                            
                            // Flash the new marker briefly
                            setTimeout(() => {
                                const newMarker = layer._vertexMarkers[insertIndex];
                                if (newMarker && newMarker._icon) {
                                    const handle = newMarker._icon.querySelector('.vertex-handle');
                                    if (handle) {
                                        handle.style.background = '#ffaa00';
                                        handle.style.transform = 'scale(1.5)';
                                        setTimeout(() => {
                                            handle.style.background = '';
                                            handle.style.transform = '';
                                        }, 300);
                                    }
                                }
                            }, 50);
                        }
                    });
                    
                    // Get all coordinates
                    let latlngs = layer.getLatLngs();
                    const flatLatlngs = this.flattenLatLngs(latlngs);
                    
                    if (Array.isArray(flatLatlngs) && flatLatlngs.length > 0) {
                        this.updateVertexMarkers(layer, flatLatlngs);
                    }
                } else if (layer instanceof L.Marker) {
                    console.log(`  - Processing as Marker`);
                    layer.dragging.enable();
                    layersProcessed++;
                } else {
                    console.log(`  - Skipping layer (not Polyline/Polygon/Marker)`);
                }
            });
            
            console.log(`Total layers processed: ${layersProcessed}`);
            
            if (layersProcessed === 0) {
                alert('No editable geometry found. The sequence may only contain unsupported geometry types. Check the browser console for details.');
                this.previewEditMode = false;
                const editModeBtn = document.getElementById('toggleEditModeBtn');
                if (editModeBtn && this.workflowStep === 'edit') {
                    editModeBtn.textContent = '✏️ Enable Edit Mode';
                    editModeBtn.style.display = 'inline-block';
                }
                document.getElementById('simplifyBtn').style.display = 'none';
                document.getElementById('toleranceInput').style.display = 'none';
                return;
            }
            
            document.getElementById('toggleEditModeBtn').textContent = '👁️ Disable Edit Mode';
            document.getElementById('toggleEditModeBtn').style.background = '#28a745';
            document.getElementById('toggleEditModeBtn').style.borderColor = '#28a745';
            document.getElementById('undoBtn').style.display = 'inline-block';
            document.getElementById('undoBtn').title = 'Undo (Ctrl+Z)';
            document.getElementById('redoBtn').style.display = 'inline-block';
            document.getElementById('redoBtn').title = 'Redo (Ctrl+Y)';
            document.getElementById('simplifyBtn').style.display = 'inline-block';
            document.getElementById('simplifyBtn').title = 'Simplify geometry to reduce nodes';
            document.getElementById('toleranceInput').style.display = 'inline-block';
            document.getElementById('toleranceInput').title = 'Tolerance in meters for simplification';
            document.getElementById('splitWayBtn').style.display = 'none'; // Hide in edit mode, show in split step
            document.getElementById('nodeSelectModeBtn').style.display = 'inline-block';
            document.getElementById('createWayFromNodesBtn').style.display = 'inline-block';
            
            // Add "Complete Edit" button for workflow (only if in edit workflow step)
            // Use setTimeout to ensure workflow step is set before checking
            setTimeout(() => {
                if (this.workflowStep === 'edit') {
                    this.addWorkflowCompleteButton('edit', 'Complete Edit Step');
                }
            }, 100);
            // Save/Revert buttons removed - edits autosave on export
            
            // Initialize undo/redo button states
            this.updateUndoRedoButtons();
            
            // Add keyboard shortcuts for undo/redo
            this._keyboardHandler = (e) => {
                // Ctrl+Z or Cmd+Z for undo
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                }
                // Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
                else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                    e.preventDefault();
                    this.redo();
                }
            };
            document.addEventListener('keydown', this._keyboardHandler);
        } else {
            // Disable editing - remove vertex markers and event handlers
            // Re-enable map dragging
            this.map.dragging.enable();
            
            this.editableLayers.forEach(layer => {
                // Skip OSM data layers (read-only, no event handlers to remove)
                if (layer._isOsmDataLayer || layer._isReadOnly) {
                    return;
                }
                
                if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
                    // Remove event handlers
                    layer.off('mousedown');
                    layer.off('click');
                    if (layer._dragHandler) {
                        this.map.off('mousemove', layer._dragHandler);
                    }
                    if (layer._dragEndHandler) {
                        this.map.off('mouseup', layer._dragEndHandler);
                        this.map.off('mouseleave', layer._dragEndHandler);
                    }
                    
                    // Remove vertex markers
                    if (layer._vertexMarkers) {
                        layer._vertexMarkers.forEach(marker => {
                            this.map.removeLayer(marker);
                        });
                        layer._vertexMarkers = [];
                    }
                    // Restore original style (only for GPS trace layers)
                    layer.setStyle({ weight: 4, opacity: 0.8, cursor: '' });
                } else if (layer instanceof L.Marker) {
                    layer.dragging.disable();
                }
            });
            
            // Hide edit mode buttons (but keep toggle button visible if in edit step)
            document.getElementById('undoBtn').style.display = 'none';
            document.getElementById('redoBtn').style.display = 'none';
            document.getElementById('selectionInfo').style.display = 'none';
            document.getElementById('simplifyBtn').style.display = 'none';
            document.getElementById('toleranceInput').style.display = 'none';
            document.getElementById('splitWayBtn').style.display = 'none';
            
            // Only hide toggle button if NOT in edit step
            const editModeBtn = document.getElementById('toggleEditModeBtn');
            if (editModeBtn) {
                if (this.workflowStep === 'edit') {
                    // In edit step, keep button visible and update text
                    editModeBtn.style.display = 'inline-block';
                    editModeBtn.textContent = '✏️ Enable Edit Mode';
                    editModeBtn.style.background = '';
                    editModeBtn.style.borderColor = '';
                    editModeBtn.classList.remove('edit-mode-active');
                } else {
                    // Not in edit step, hide button
                    editModeBtn.style.display = 'none';
                }
            }
            
            // Hide tag editor panel (step 4)
            const tagEditorPanel = document.getElementById('tagEditorPanel');
            if (tagEditorPanel) {
                tagEditorPanel.style.display = 'none';
            }
            
            // Remove workflow complete button if exists
            this.removeWorkflowCompleteButton();
            document.getElementById('saveEditsBtn').style.display = 'none';
            document.getElementById('revertEditsBtn').style.display = 'none';
            
            // Disable split mode if active
            if (this.splitMode) {
                this.toggleSplitMode();
            }
            
            // Disable node selection mode if active
            if (this.nodeSelectionMode) {
                this.toggleNodeSelectionMode();
            }
            
            // Remove keyboard shortcuts
            if (this._keyboardHandler) {
                document.removeEventListener('keydown', this._keyboardHandler);
                this._keyboardHandler = null;
            }
        }
    }


    // Save current geometry state to history for undo/redo
    // Debounced to prevent excessive history saves during rapid operations
    saveStateToHistory() {
        if (!this.editableLayers || this.editableLayers.length === 0) {
            return; // Nothing to save
        }
        
        // Debounce history saves for performance (only save after operations complete)
        if (this._historySaveTimeout) {
            clearTimeout(this._historySaveTimeout);
        }
        
        this._historySaveTimeout = setTimeout(() => {
            this._doSaveStateToHistory();
            this._historySaveTimeout = null;
        }, 100); // Wait 100ms after last operation before saving
    }
    
    // Internal method to actually save state
    _doSaveStateToHistory() {
        if (!this.editableLayers || this.editableLayers.length === 0) {
            return;
        }
        
        // Capture current state of all editable layers
        const state = this.editableLayers.map(layer => {
            if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
                const latlngs = this.flattenLatLngs(layer.getLatLngs());
                // Convert to serializable format [lat, lng]
                return {
                    type: layer instanceof L.Polygon ? 'Polygon' : 'Polyline',
                    latlngs: latlngs.map(ll => {
                        if (ll instanceof L.LatLng) {
                            return [ll.lat, ll.lng];
                        } else if (Array.isArray(ll)) {
                            return [ll[0] || ll.lat, ll[1] || ll.lng];
                        }
                        return [ll.lat || ll[0], ll.lng || ll[1]];
                    })
                };
            } else if (layer instanceof L.Marker) {
                const latlng = layer.getLatLng();
                return {
                    type: 'Marker',
                    latlng: [latlng.lat, latlng.lng]
                };
            }
            return null;
        }).filter(s => s !== null);
        
        // Remove any states after current index (when user did undo, then made new edit)
        if (this.currentHistoryIndex < this.editHistory.length - 1) {
            this.editHistory = this.editHistory.slice(0, this.currentHistoryIndex + 1);
        }
        
        // Add new state
        this.editHistory.push(state);
        this.currentHistoryIndex = this.editHistory.length - 1;
        
        // Limit history size
        if (this.editHistory.length > this.maxHistorySize) {
            this.editHistory.shift();
            this.currentHistoryIndex--;
        }
        
        // Update button states
        this.updateUndoRedoButtons();
        
        console.log('State saved to history. Index:', this.currentHistoryIndex, 'Total states:', this.editHistory.length);
    }

    // Restore geometry state from history
    restoreStateFromHistory(state) {
        if (!state || !this.editableLayers) return;
        
        state.forEach((layerState, idx) => {
            if (idx >= this.editableLayers.length) return;
            
            const layer = this.editableLayers[idx];
            
            if (layerState.type === 'Polyline' || layerState.type === 'Polygon') {
                // Convert back to LatLng objects
                const latlngs = layerState.latlngs.map(ll => L.latLng(ll[0], ll[1]));
                
                if (layer instanceof L.Polygon) {
                    layer.setLatLngs([latlngs]);
                } else {
                    layer.setLatLngs(latlngs);
                }
                
                // Update vertex markers
                this.updateVertexMarkers(layer, latlngs);
                
                // Markers created - no merge restoration needed
            } else if (layerState.type === 'Marker' && layer instanceof L.Marker) {
                const latlng = L.latLng(layerState.latlng[0], layerState.latlng[1]);
                layer.setLatLng(latlng);
            }
        });
    }

    // Undo last edit
    undo() {
        if (this.currentHistoryIndex <= 0) {
            console.log('Nothing to undo');
            return;
        }
        
        // Move back in history
        this.currentHistoryIndex--;
        const previousState = this.editHistory[this.currentHistoryIndex];
        
        // Restore previous state
        this.restoreStateFromHistory(previousState);
        
        // Update button states
        this.updateUndoRedoButtons();
        
        console.log('Undo performed. Current index:', this.currentHistoryIndex);
    }

    // Redo last undone edit
    redo() {
        if (this.currentHistoryIndex >= this.editHistory.length - 1) {
            console.log('Nothing to redo');
            return;
        }
        
        // Move forward in history
        this.currentHistoryIndex++;
        const nextState = this.editHistory[this.currentHistoryIndex];
        
        // Restore next state
        this.restoreStateFromHistory(nextState);
        
        // Update button states
        this.updateUndoRedoButtons();
        
        console.log('Redo performed. Current index:', this.currentHistoryIndex);
    }

    // Update undo/redo button states
    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) {
            undoBtn.disabled = this.currentHistoryIndex <= 0;
            undoBtn.style.opacity = undoBtn.disabled ? '0.5' : '1';
            undoBtn.style.cursor = undoBtn.disabled ? 'not-allowed' : 'pointer';
        }
        
        if (redoBtn) {
            redoBtn.disabled = this.currentHistoryIndex >= this.editHistory.length - 1;
            redoBtn.style.opacity = redoBtn.disabled ? '0.5' : '1';
            redoBtn.style.cursor = redoBtn.disabled ? 'not-allowed' : 'pointer';
        }
    }

    // Initialize history when entering edit mode
    initializeHistory() {
        // Clear history and save initial state
        this.editHistory = [];
        this.currentHistoryIndex = -1;
        this.saveStateToHistory(); // Save initial state
    }

    // Helper: Flatten latlngs array
    flattenLatLngs(arr) {
        if (!arr) return [];
        if (!Array.isArray(arr)) {
            if (arr instanceof L.LatLng) return [arr];
            return [];
        }
        
        const result = [];
        arr.forEach(item => {
            if (item instanceof L.LatLng) {
                result.push(item);
            } else if (Array.isArray(item)) {
                if (item.length > 0) {
                    if (item[0] instanceof L.LatLng) {
                        result.push(...item);
                    } else if (Array.isArray(item[0])) {
                        result.push(...this.flattenLatLngs(item));
                    }
                }
            }
        });
        return result;
    }

    // Helper: Check if a position matches an OSM node or way and restore merge info
    checkAndRestoreOsmMerge(marker, latlng) {
        const lat = latlng instanceof L.LatLng ? latlng.lat : latlng[0] || latlng.lat;
        const lon = latlng instanceof L.LatLng ? latlng.lng : latlng[1] || latlng.lng;
        const mergeThreshold = 0.000005; // Very strict threshold for exact match (~0.5 meter) - only restore if actually merged
        
        // FIRST: Check if this position matches a way (prioritize ways)
        if (this.osmWays && this.osmWays.length > 0) {
            this.osmWays.forEach((way) => {
                if (way.coordinates && way.coordinates.length >= 2) {
                    const wayPoint = this.findNearestPointOnWay(latlng, way.coordinates, mergeThreshold);
                    if (wayPoint) {
                        // This node is on an OSM way - restore merge info
                        marker._mergedToWay = {
                            isOsmWay: true,
                            lat: wayPoint.lat,
                            lon: wayPoint.lon,
                            segmentIndex: wayPoint.segmentIndex,
                            param: wayPoint.param
                        };
                        marker._mergedOsmWayId = way.id;
                        marker._mergedOsmWayTags = way.tags;
                        marker._isMerged = true;
                        marker._isMergedToWay = true;
                        
                        // Update visual feedback (forest green for way)
                        const icon = marker.getIcon();
                        if (icon && icon.options) {
                            icon.options.html = '<div class="vertex-handle" style="background: #228B22; border-color: #ffffff;"></div>';
                            marker.setIcon(icon);
                        }
                        return; // Found way, don't check nodes
                    }
                }
            });
        }
        
        // SECOND: Check if this position matches an OSM node (only if no way found)
        if (!marker._isMerged && this.osmNodes && this.osmNodes.size > 0) {
            this.osmNodes.forEach((node, nodeId) => {
                const dx = node.lon - lon;
                const dy = node.lat - lat;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= mergeThreshold) {
                    // This node is at an OSM node position - restore merge info
                    marker._mergedOsmNodeId = nodeId;
                    marker._mergedOsmNodeData = {
                        id: nodeId,
                        lat: node.lat,
                        lon: node.lon
                    };
                    marker._isMerged = true;
                    marker._isMergedToWay = false;
                    
                    // Update visual feedback (dark green for node)
                    const icon = marker.getIcon();
                    if (icon && icon.options) {
                        icon.options.html = '<div class="vertex-handle" style="background: #006400; border-color: #ffffff;"></div>';
                        marker.setIcon(icon);
                    }
                }
            });
        }
        
        // Also check GPS trace ways (editable layers)
        if (!marker._isMerged && this.editableLayers && this.editableLayers.length > 0) {
            this.editableLayers.forEach((gpsLayer) => {
                if (gpsLayer instanceof L.Polyline || gpsLayer instanceof L.Polygon) {
                    const layerLatlngs = this.flattenLatLngs(gpsLayer.getLatLngs());
                    
                    if (layerLatlngs.length >= 2) {
                        const wayCoords = layerLatlngs.map(ll => {
                            if (ll instanceof L.LatLng) {
                                return { lat: ll.lat, lon: ll.lng };
                            } else if (Array.isArray(ll)) {
                                return { lat: ll[0] || ll.lat, lon: ll[1] || ll.lng };
                            }
                            return { lat: ll.lat || ll[0], lon: ll.lng || ll[1] };
                        });
                        
                        const wayPoint = this.findNearestPointOnWay(latlng, wayCoords, mergeThreshold);
                        if (wayPoint) {
                            // This node is on a GPS trace way - restore merge info
                            marker._mergedToWay = {
                                isOsmWay: false,
                                lat: wayPoint.lat,
                                lon: wayPoint.lon,
                                segmentIndex: wayPoint.segmentIndex,
                                param: wayPoint.param
                            };
                            marker._mergedGpsWayLayer = gpsLayer;
                            marker._isMerged = true;
                            marker._isMergedToWay = true;
                            
                            // Update visual feedback (forest green for way)
                            const icon = marker.getIcon();
                            if (icon && icon.options) {
                                icon.options.html = '<div class="vertex-handle" style="background: #228B22; border-color: #ffffff;"></div>';
                                marker.setIcon(icon);
                            }
                        }
                    }
                }
            });
        }
    }

    // Helper: Update vertex markers for a layer
    updateVertexMarkers(layer, latlngs) {
        // Performance optimization: Use requestAnimationFrame for smooth updates
        if (layer._updatingMarkers) {
            return; // Already updating, skip to prevent duplicate updates
        }
        
        layer._updatingMarkers = true;
        
        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
            // Clear existing markers efficiently
            if (layer._vertexMarkers) {
                layer._vertexMarkers.forEach(marker => {
                    // Remove all event listeners before removing from map
                    marker.off();
                    this.map.removeLayer(marker);
                });
            }
            layer._vertexMarkers = [];
            
            // Add markers for each vertex
            latlngs.forEach((latlng, index) => {
            let lat, lng;
            if (latlng instanceof L.LatLng) {
                lat = latlng.lat;
                lng = latlng.lng;
            } else if (Array.isArray(latlng)) {
                lat = latlng[0];
                lng = latlng[1];
            } else {
                lat = latlng.lat || latlng[0];
                lng = latlng.lng || latlng[1];
            }
            
            // Determine marker state and styling
            let markerClass = 'vertex-handle';
            let markerColor = '#ff0000'; // Default red
            let isNodeSelected = false;
            let isSplittableNode = false;
            
            // Check if in split mode - show all nodes, highlight splittable ones
            if (this.splitMode && layer._isGpsTrace) {
                // Can split at middle nodes (not first or last)
                if (index > 0 && index < latlngs.length - 1) {
                    markerClass = 'vertex-handle split-candidate';
                    markerColor = '#28a745'; // Green for splittable nodes
                    isSplittableNode = true;
                } else {
                    markerClass = 'vertex-handle split-invalid';
                    markerColor = '#999999'; // Gray for non-splittable nodes
                }
            }
            
            // Check if node is selected
            if (this.nodeSelectionMode && !isSplittableNode) {
                const isSelected = this.selectedNodes.some(n => 
                    n.layer === layer && n.nodeIndex === index
                );
                if (isSelected) {
                    markerClass = 'vertex-handle node-selected';
                    markerColor = '#ff8800';
                    isNodeSelected = true;
                }
            }
            
            // Check if marker is merged (for restoring state)
            const existingMarker = layer._vertexMarkers && layer._vertexMarkers[index];
            if (!isNodeSelected && existingMarker && existingMarker._isMerged) {
                if (existingMarker._isMergedToWay) {
                    markerClass = 'vertex-handle merged-way';
                    markerColor = '#228B22'; // Forest green for way merge
                } else {
                    markerClass = 'vertex-handle merged';
                    markerColor = '#00ff00'; // Green for node merge
                }
            }
            
            // Vertex marker with enhanced visuals - larger in split mode
            const markerSize = this.splitMode && isSplittableNode ? 18 : 14;
            const marker = L.marker([lat, lng], {
                draggable: !this.splitMode, // Disable dragging in split mode
                icon: L.divIcon({
                    className: 'vertex-marker',
                    html: `<div class="${markerClass}">${isSplittableNode ? '✂️' : ''}</div>`,
                    iconSize: [markerSize, markerSize],
                    iconAnchor: [markerSize / 2, markerSize / 2]
                }),
                zIndexOffset: 1100, // Higher than delete button (1000) to ensure marker is on top
                interactive: true
            }).addTo(this.map);
            
            // Add hover effect for split mode
            if (this.splitMode && isSplittableNode) {
                marker.on('mouseover', function() {
                    if (this._icon) {
                        const handle = this._icon.querySelector('.vertex-handle');
                        if (handle) {
                            handle.style.transform = 'scale(1.5)';
                            handle.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.8), 0 0 0 4px rgba(40, 167, 69, 0.4)';
                        }
                    }
                });
                
                marker.on('mouseout', function() {
                    if (this._icon) {
                        const handle = this._icon.querySelector('.vertex-handle');
                        if (handle) {
                            handle.style.transform = '';
                            handle.style.boxShadow = '';
                        }
                    }
                });
            }
            
            // Store reference to layer
            marker._parentLayer = layer;
            
            // Don't check for merge on initial creation - only check when explicitly needed (undo/redo)
            // Markers start as red (not merged) by default
            
            // No delete button needed - clicking the node itself will delete it
            // Ensure marker dragging is enabled
            marker.dragging.enable();
            marker.setZIndexOffset(1100);
            
            // Track mouse state to distinguish between click (delete) and drag (move)
            marker._mouseDownPos = null;
            marker._hasMoved = false;
            marker._clickTimeout = null;
            marker._isDragging = false;
            
            // Handle mousedown - track initial position
            marker.on('mousedown', (e) => {
                // Disable map dragging when clicking on marker
                this.map.dragging.disable();
                // Store initial mouse position
                marker._mouseDownPos = {
                    x: e.originalEvent.clientX,
                    y: e.originalEvent.clientY,
                    latlng: e.latlng
                };
                marker._hasMoved = false;
                marker._isDragging = false;
                
                // Set a timeout to detect click (if no drag happens)
                marker._clickTimeout = setTimeout(() => {
                    // If mouse hasn't moved significantly and drag hasn't started, treat as click
                    if (!marker._hasMoved && !marker._isDragging) {
                        // This will be handled by mouseup if it's still a click
                    }
                }, 50);
            });
            
            // Handle mousemove on marker to detect if it's a drag
            marker.on('mousemove', (e) => {
                if (marker._mouseDownPos) {
                    const dx = Math.abs(e.originalEvent.clientX - marker._mouseDownPos.x);
                    const dy = Math.abs(e.originalEvent.clientY - marker._mouseDownPos.y);
                    // If mouse moved more than 5 pixels, it's a drag
                    if (dx > 5 || dy > 5) {
                        marker._hasMoved = true;
                        // Clear click timeout since this is a drag
                        if (marker._clickTimeout) {
                            clearTimeout(marker._clickTimeout);
                            marker._clickTimeout = null;
                        }
                    }
                }
            });
            
            // Handle click (mouseup without significant movement) = DELETE or SPLIT or MERGE SELECTION
            marker.on('click', (e) => {
                // Only process if it wasn't a drag
                if (!marker._hasMoved && !marker._isDragging) {
                    e.originalEvent.stopPropagation();
                    e.originalEvent.preventDefault();
                    
                    // Check if split mode is enabled
                    if (this.splitMode && layer instanceof L.Polyline && layer._isGpsTrace) {
                        // Check if this is a valid split point (not first or last node)
                        if (index > 0 && index < latlngs.length - 1) {
                            // Split way at this node
                            this.splitWayAtNode(layer, index);
                        } else {
                            alert('Cannot split at the first or last node. Please select a middle node.');
                        }
                        return;
                    }
                    
                    // Edit mode: delete node with visual feedback
                    if (latlngs.length > 2) { // Keep at least 2 points
                        // Visual feedback: flash red before deletion
                        if (marker._icon) {
                            const handle = marker._icon.querySelector('.vertex-handle');
                            if (handle) {
                                const originalBg = handle.style.background || '';
                                handle.style.background = '#ff0000';
                                handle.style.transform = 'scale(1.5)';
                                
                                setTimeout(() => {
                        // Save state before deleting node
                        this.saveStateToHistory();
                        
                                    // Smooth deletion: use requestAnimationFrame for seamless update
                                    requestAnimationFrame(() => {
                        latlngs.splice(index, 1);
                        layer.setLatLngs(layer instanceof L.Polygon ? [latlngs] : latlngs);
                        this.updateVertexMarkers(layer, latlngs);
                                    });
                                }, 150);
                    } else {
                                // Fallback if handle not found
                                this.saveStateToHistory();
                                latlngs.splice(index, 1);
                                layer.setLatLngs(layer instanceof L.Polygon ? [latlngs] : latlngs);
                                this.updateVertexMarkers(layer, latlngs);
                            }
                        } else {
                            // Fallback if icon not found
                            this.saveStateToHistory();
                            latlngs.splice(index, 1);
                            layer.setLatLngs(layer instanceof L.Polygon ? [latlngs] : latlngs);
                            this.updateVertexMarkers(layer, latlngs);
                        }
                    } else {
                        // Visual feedback: shake animation for invalid deletion
                        if (marker._icon) {
                            const handle = marker._icon.querySelector('.vertex-handle');
                            if (handle) {
                                handle.style.animation = 'shake 0.5s';
                                setTimeout(() => {
                                    handle.style.animation = '';
                                }, 500);
                            }
                        }
                        alert('Cannot delete node. A line must have at least 2 points.');
                    }
                }
                
                // Reset state
                marker._mouseDownPos = null;
                marker._hasMoved = false;
                if (marker._clickTimeout) {
                    clearTimeout(marker._clickTimeout);
                    marker._clickTimeout = null;
                }
            });
            
            // Handle dragstart - this is a DRAG, not a click
            marker.on('dragstart', (e) => {
                // Mark as dragging
                marker._isDragging = true;
                marker._hasMoved = true;
                
                // Visual feedback: change marker appearance during drag
                if (marker._icon) {
                    const handle = marker._icon.querySelector('.vertex-handle');
                    if (handle) {
                        handle.classList.add('dragging');
                    }
                }
                
                // Visual feedback: highlight the way being edited
                if (layer && layer.setStyle) {
                    layer.setStyle({ 
                        weight: 8, 
                        opacity: 1.0,
                        color: '#0052cc'
                    });
                }
                
                // Clear click timeout since this is a drag
                if (marker._clickTimeout) {
                    clearTimeout(marker._clickTimeout);
                    marker._clickTimeout = null;
                }
                
                // Ensure map dragging is disabled
                this.map.dragging.disable();
                // Stop propagation to prevent map events
                L.DomEvent.stopPropagation(e);
            });
            
            // Optimize drag handler with requestAnimationFrame for smooth performance
            let dragRafId = null;
            marker.on('drag', (e) => {
                // Keep map dragging disabled during drag
                this.map.dragging.disable();
                // Stop propagation to prevent map from moving
                L.DomEvent.stopPropagation(e);
                
                // Use requestAnimationFrame to batch updates for smooth performance
                if (dragRafId) {
                    cancelAnimationFrame(dragRafId);
                }
                
                dragRafId = requestAnimationFrame(() => {
                    // Simple, smooth node dragging - no merging logic
                    let newLatlng = e.target.getLatLng();
                    
                    // Update node position smoothly
                    if (latlngs[index] instanceof L.LatLng) {
                        latlngs[index].lat = newLatlng.lat;
                        latlngs[index].lng = newLatlng.lng;
                    } else {
                        latlngs[index] = newLatlng;
                    }
                    layer.setLatLngs(layer instanceof L.Polygon ? [latlngs] : latlngs);
                    dragRafId = null;
                });
            });
            
            marker.on('dragend', (e) => {
                // Smooth transition: use requestAnimationFrame for seamless state restoration
                requestAnimationFrame(() => {
                    // Smoothly remove dragging visual state
                    if (marker._icon) {
                        const handle = marker._icon.querySelector('.vertex-handle');
                        if (handle) {
                            handle.classList.remove('dragging');
                            // Smooth transition back to normal size
                            handle.style.transition = 'transform 0.15s ease-out, box-shadow 0.15s ease-out';
                            setTimeout(() => {
                                handle.style.transition = '';
                            }, 150);
                        }
                    }
                    
                    // Smoothly restore way styling after drag
                    if (layer && layer.setStyle) {
                        if (this.selectedWayLayer === layer) {
                            layer.setStyle({ 
                                weight: 6, 
                                opacity: 0.9,
                                color: '#0066ff',
                                dashArray: '5, 5'
                            });
                        } else {
                            layer.setStyle({ 
                                weight: 4, 
                                opacity: 0.8,
                                color: '#0066ff'
                            });
                        }
                    }
                    
                // Mark that dragging has ended
                marker._isDragging = false;
                marker._mouseDownPos = null;
                marker._hasMoved = false;
                
                    // Update geometry smoothly
                    const latlngs = this.flattenLatLngs(layer.getLatLngs());
                    latlngs[index] = e.target.getLatLng();
                    layer.setLatLngs(layer instanceof L.Polygon ? [latlngs] : latlngs);
                    
                    // Update vertex markers smoothly (only if in edit mode)
                    if (this.previewEditMode) {
                        this.updateVertexMarkers(layer, latlngs);
                    }
                    
                    // Save state after node drag completes (debounced for smooth performance)
                this.saveStateToHistory();
                });
                
                // Stop propagation
                L.DomEvent.stopPropagation(e);
                // Map dragging stays disabled in edit mode (we'll re-enable when exiting edit mode)
            });
            
            // Handle mouseup to clean up state
            marker.on('mouseup', (e) => {
                // Reset state
                if (marker._clickTimeout) {
                    clearTimeout(marker._clickTimeout);
                    marker._clickTimeout = null;
                }
                marker._mouseDownPos = null;
            });
            
            layer._vertexMarkers.push(marker);
            });
            
            // Mark update as complete
            layer._updatingMarkers = false;
        });
    }

    // Helper: Find nearest point on a way segment (for way merging)
    findNearestPointOnWay(latlng, wayCoordinates, threshold = 0.00002) {
        if (!wayCoordinates || wayCoordinates.length < 2) {
            return null;
        }
        
        const lat = latlng instanceof L.LatLng ? latlng.lat : latlng[0] || latlng.lat;
        const lon = latlng instanceof L.LatLng ? latlng.lng : latlng[1] || latlng.lng;
        
        let nearestPoint = null;
        let minDistance = Infinity;
        
        // Check each segment of the way
        for (let i = 0; i < wayCoordinates.length - 1; i++) {
            const segStart = wayCoordinates[i];
            const segEnd = wayCoordinates[i + 1];
            
            const segStartLat = segStart.lat || segStart[0];
            const segStartLon = segStart.lon || segStart[1];
            const segEndLat = segEnd.lat || segEnd[0];
            const segEndLon = segEnd.lon || segEnd[1];
            
            // Calculate closest point on line segment
            const A = lat - segStartLat;
            const B = lon - segStartLon;
            const C = segEndLat - segStartLat;
            const D = segEndLon - segStartLon;
            
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = 0;
            
            if (lenSq !== 0) {
                param = Math.max(0, Math.min(1, dot / lenSq));
            }
            
            // Closest point on the segment
            const closestLat = segStartLat + param * C;
            const closestLon = segStartLon + param * D;
            
            // Calculate distance
            const dx = closestLon - lon;
            const dy = closestLat - lat;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance && distance <= threshold) {
                minDistance = distance;
                nearestPoint = {
                    lat: closestLat,
                    lon: closestLon,
                    distance: distance,
                    segmentIndex: i,
                    param: param // Position along segment (0 = start, 1 = end)
                };
            }
        }
        
        return nearestPoint;
    }

    // Helper: Find nearest node or way point (for merging)
    // Prioritizes ways over nodes (user preference)
    findNearestNodeFromAllLayers(latlng, currentLayer, currentIndex, threshold = 0.00002) {
        let nearestTarget = null;
        let minDistance = Infinity;
        
        const lat = latlng instanceof L.LatLng ? latlng.lat : latlng[0] || latlng.lat;
        const lon = latlng instanceof L.LatLng ? latlng.lng : latlng[1] || latlng.lng;
        
        // FIRST: Check ways (prioritize ways over nodes)
        // Check GPS trace ways (editable layers)
        if (this.editableLayers && this.editableLayers.length > 0) {
            this.editableLayers.forEach((layer) => {
                if ((layer instanceof L.Polyline || layer instanceof L.Polygon) && 
                    layer !== currentLayer) { // Don't check the layer being edited
                    const layerLatlngs = this.flattenLatLngs(layer.getLatLngs());
                    
                    if (layerLatlngs.length >= 2) {
                        // Convert to way coordinates format
                        const wayCoords = layerLatlngs.map(ll => {
                            if (ll instanceof L.LatLng) {
                                return { lat: ll.lat, lon: ll.lng };
                            } else if (Array.isArray(ll)) {
                                return { lat: ll[0] || ll.lat, lon: ll[1] || ll.lng };
                            }
                            return { lat: ll.lat || ll[0], lon: ll.lng || ll[1] };
                        });
                        
                        const wayPoint = this.findNearestPointOnWay(latlng, wayCoords, threshold);
                        if (wayPoint && wayPoint.distance < minDistance) {
                            minDistance = wayPoint.distance;
                            nearestTarget = {
                                lat: wayPoint.lat,
                                lon: wayPoint.lon,
                                distance: wayPoint.distance,
                                isWay: true,
                                isOsmWay: false, // GPS trace way
                                layer: layer,
                                segmentIndex: wayPoint.segmentIndex,
                                param: wayPoint.param
                            };
                        }
                    }
                }
            });
        }
        
        // Check OSM ways (read-only background data)
        if (this.osmWays && this.osmWays.length > 0) {
            this.osmWays.forEach((way) => {
                if (way.coordinates && way.coordinates.length >= 2) {
                    const wayPoint = this.findNearestPointOnWay(latlng, way.coordinates, threshold);
                    if (wayPoint && wayPoint.distance < minDistance) {
                        minDistance = wayPoint.distance;
                        nearestTarget = {
                            lat: wayPoint.lat,
                            lon: wayPoint.lon,
                            distance: wayPoint.distance,
                            isWay: true,
                            isOsmWay: true, // OSM way
                            osmWayId: way.id,
                            osmWayTags: way.tags,
                            segmentIndex: wayPoint.segmentIndex,
                            param: wayPoint.param
                        };
                    }
                }
            });
        }
        
        // SECOND: Check nodes (only if no way was found, or if node is closer)
        let nearestNode = null;
        let minNodeDistance = Infinity;
        
        // Check all editable layers (GPS trace nodes)
        if (this.editableLayers && this.editableLayers.length > 0) {
            this.editableLayers.forEach((layer) => {
                if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
                    const layerLatlngs = this.flattenLatLngs(layer.getLatLngs());
                    
                    layerLatlngs.forEach((nodeLatlng, nodeIndex) => {
                        // Skip the current node being dragged
                        if (layer === currentLayer && nodeIndex === currentIndex) {
                            return;
                        }
                        
                        let nodeLat, nodeLon;
                        if (nodeLatlng instanceof L.LatLng) {
                            nodeLat = nodeLatlng.lat;
                            nodeLon = nodeLatlng.lng;
                        } else if (Array.isArray(nodeLatlng)) {
                            nodeLat = nodeLatlng[0] || nodeLatlng.lat;
                            nodeLon = nodeLatlng[1] || nodeLatlng.lng;
                        } else {
                            nodeLat = nodeLatlng.lat || nodeLatlng[0];
                            nodeLon = nodeLatlng.lng || nodeLatlng[1];
                        }
                        
                        const dx = nodeLon - lon;
                        const dy = nodeLat - lat;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance < minNodeDistance && distance <= threshold) {
                            minNodeDistance = distance;
                            nearestNode = { 
                                lat: nodeLat, 
                                lon: nodeLon, 
                                layer: layer,
                                index: nodeIndex,
                                distance: distance,
                                isOsmNode: false // GPS trace node
                            };
                        }
                    });
                }
            });
        }
        
        // Also check OSM nodes (read-only background data)
        if (this.osmNodes && this.osmNodes.size > 0) {
            this.osmNodes.forEach((node, nodeId) => {
                const dx = node.lon - lon;
                const dy = node.lat - lat;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < minNodeDistance && distance <= threshold) {
                    minNodeDistance = distance;
                    nearestNode = { 
                        lat: node.lat, 
                        lon: node.lon, 
                        osmNodeId: nodeId, // Store OSM node ID
                        distance: distance,
                        isOsmNode: true // OSM node
                    };
                }
            });
        }
        
        // Prefer way over node (user preference: prefer to merge to way)
        // But if node is significantly closer, use node instead
        if (nearestTarget && nearestNode) {
            // If way is found and node is not much closer (within 20% of way distance), prefer way
            if (nearestNode.distance < nearestTarget.distance * 0.8) {
                // Node is significantly closer, use node
                return nearestNode;
            } else {
                // Prefer way (as requested)
                return nearestTarget;
            }
        }
        
        // Return whichever was found
        return nearestTarget || nearestNode;
    }
    
    // Helper: Find nearest OSM node for snapping (kept for potential future use)
    findNearestOsmNode(latlng, threshold = null) {
        if (!this.osmNodes || this.osmNodes.size === 0) {
            return null;
        }
        
        const thresholdDist = threshold || this.snapThreshold;
        let nearestNode = null;
        let minDistance = Infinity;
        
        const lat = latlng instanceof L.LatLng ? latlng.lat : latlng[0] || latlng.lat;
        const lon = latlng instanceof L.LatLng ? latlng.lng : latlng[1] || latlng.lng;
        
        this.osmNodes.forEach((node, nodeId) => {
            const dx = node.lon - lon;
            const dy = node.lat - lat;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance && distance <= thresholdDist) {
                minDistance = distance;
                nearestNode = { lat: node.lat, lon: node.lon, id: nodeId, distance: distance };
            }
        });
        
        return nearestNode;
    }
    
    // Helper: Calculate distance between two lat/lng points
    // Supports both formats: calculateDistance(lat1, lon1, lat2, lon2) or calculateDistance(latlng1, latlng2)
    calculateDistance(lat1OrLatlng1, lon1OrLatlng2, lat2, lon2) {
        let lat1, lon1, lat2Final, lon2Final;
        
        // Check if called with 4 parameters (lat1, lon1, lat2, lon2)
        if (arguments.length === 4 && typeof lat1OrLatlng1 === 'number' && typeof lon1OrLatlng2 === 'number') {
            lat1 = lat1OrLatlng1;
            lon1 = lon1OrLatlng2;
            lat2Final = lat2;
            lon2Final = lon2;
        } else {
            // Called with 2 parameters (latlng1, latlng2)
            const latlng1 = lat1OrLatlng1;
            const latlng2 = lon1OrLatlng2;
            lat1 = latlng1 instanceof L.LatLng ? latlng1.lat : latlng1[0] || latlng1.lat;
            lon1 = latlng1 instanceof L.LatLng ? latlng1.lng : latlng1[1] || latlng1.lng;
            lat2Final = latlng2 instanceof L.LatLng ? latlng2.lat : latlng2[0] || latlng2.lat;
            lon2Final = latlng2 instanceof L.LatLng ? latlng2.lng : latlng2[1] || latlng2.lng;
        }
        
        // Use Haversine formula for accurate distance in meters
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2Final - lat1) * Math.PI / 180;
        const dLon = (lon2Final - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2Final * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in meters
    }
    
    // Helper: Calculate distance from point to line segment
    distanceToSegment(point, segStart, segEnd) {
        const A = point.lat - segStart.lat;
        const B = point.lng - segStart.lng;
        const C = segEnd.lat - segStart.lat;
        const D = segEnd.lng - segStart.lng;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, yy;
        
        if (param < 0) {
            xx = segStart.lat;
            yy = segStart.lng;
        } else if (param > 1) {
            xx = segEnd.lat;
            yy = segEnd.lng;
        } else {
            xx = segStart.lat + param * C;
            yy = segStart.lng + param * D;
        }
        
        const dx = point.lat - xx;
        const dy = point.lng - yy;
        return Math.sqrt(dx * dx + dy * dy) * 111000; // Convert to approximate meters
    }

    // Douglas-Peucker line simplification algorithm
    douglasPeucker(points, tolerance) {
        if (points.length <= 2) return points;
        
        // Find the point with maximum distance from line between first and last point
        let maxDistance = 0;
        let maxIndex = 0;
        const first = points[0];
        const last = points[points.length - 1];
        
        for (let i = 1; i < points.length - 1; i++) {
            const distance = this.perpendicularDistance(points[i], first, last);
            if (distance > maxDistance) {
                maxDistance = distance;
                maxIndex = i;
            }
        }
        
        // If max distance is greater than tolerance, recursively simplify
        if (maxDistance > tolerance) {
            // Recursive call on both sides
            const left = this.douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
            const right = this.douglasPeucker(points.slice(maxIndex), tolerance);
            
            // Combine results (remove duplicate point at junction)
            return left.slice(0, -1).concat(right);
        } else {
            // Return only endpoints
            return [first, last];
        }
    }

    // Calculate perpendicular distance from point to line segment (in meters)
    perpendicularDistance(point, lineStart, lineEnd) {
        const [lon0, lat0] = point;
        const [lon1, lat1] = lineStart;
        const [lon2, lat2] = lineEnd;
        
        // Calculate distance using cross product in lat/lng space
        const dx = lon2 - lon1;
        const dy = lat2 - lat1;
        const d = Math.sqrt(dx * dx + dy * dy);
        
        if (d === 0) {
            // Line start and end are the same, calculate distance to point
            return this.haversineDistance([lon0, lat0], [lon1, lat1]);
        }
        
        // Calculate perpendicular distance
        const t = Math.max(0, Math.min(1, ((lon0 - lon1) * dx + (lat0 - lat1) * dy) / (d * d)));
        const projLon = lon1 + t * dx;
        const projLat = lat1 + t * dy;
        
        return this.haversineDistance([lon0, lat0], [projLon, projLat]);
    }

    // Haversine distance between two points (in meters)
    haversineDistance(point1, point2) {
        const R = 6371000; // Earth radius in meters
        const [lon1, lat1] = point1;
        const [lon2, lat2] = point2;
        
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Simplify geometry using Douglas-Peucker
    simplifyGeometry() {
        if (!this.currentPreviewSequence || !this.editableLayers || this.editableLayers.length === 0) {
            alert('No geometry to simplify. Please open a preview first.');
            return;
        }
        
        if (!this.previewEditMode) {
            alert('Please enable edit mode first.');
            return;
        }
        
        const toleranceInput = document.getElementById('toleranceInput');
        const tolerance = parseFloat(toleranceInput.value) || 5; // Default 5 meters
        
        if (tolerance <= 0) {
            alert('Tolerance must be greater than 0.');
            return;
        }
        
        // Visual feedback: disable button and show progress
        const simplifyBtn = document.getElementById('simplifyBtn');
        if (simplifyBtn) {
            simplifyBtn.disabled = true;
            simplifyBtn.textContent = '⏳ Simplifying...';
        }
        
        // Save state before simplifying
        this.saveStateToHistory();
        
        let totalNodesBefore = 0;
        let totalNodesAfter = 0;
        
        // Simplify each layer - ONLY GPS trace layers (blue ways), not OSM data
        const gpsTraceLayers = this.editableLayers.filter(layer => layer._isGpsTrace && (layer instanceof L.Polyline || layer instanceof L.Polygon));
        
        if (gpsTraceLayers.length === 0) {
            if (simplifyBtn) {
                simplifyBtn.disabled = false;
                simplifyBtn.textContent = '📉 Simplify Geometry';
            }
            alert('No GPS trace geometry found to simplify. Simplify only works on GPS trace (blue lines), not OSM data.');
            return;
        }
        
        // Visual feedback: briefly highlight layers being simplified
        gpsTraceLayers.forEach(layer => {
            if (layer.setStyle) {
                const originalStyle = { ...layer.options };
                layer.setStyle({ 
                    weight: 8, 
                    opacity: 1.0,
                    color: '#ffaa00' // Orange highlight during simplification
                });
                
                setTimeout(() => {
                    layer.setStyle({ 
                        weight: 6, 
                        opacity: 0.9,
                        color: '#0066ff'
                    });
                }, 500);
            }
        });
        
        gpsTraceLayers.forEach((layer) => {
            const latlngs = this.flattenLatLngs(layer.getLatLngs());
            
            if (latlngs.length <= 2) {
                return; // Can't simplify lines with 2 or fewer points
            }
            
            totalNodesBefore += latlngs.length;
            
            // Convert to [lng, lat] format for algorithm
            const points = latlngs.map(ll => {
                if (ll instanceof L.LatLng) {
                    return [ll.lng, ll.lat];
                } else if (Array.isArray(ll)) {
                    // Assume [lat, lng] format
                    return [ll[1] || ll[0], ll[0] || ll[1]];
                }
                return [ll.lng, ll.lat];
            });
            
            // Apply Douglas-Peucker
            const simplified = this.douglasPeucker(points, tolerance);
            
            totalNodesAfter += simplified.length;
            
            // Convert back to LatLng objects
            const simplifiedLatLngs = simplified.map(pt => L.latLng(pt[1], pt[0]));
            
            // Update the layer
            if (layer instanceof L.Polygon) {
                layer.setLatLngs([simplifiedLatLngs]);
            } else {
                layer.setLatLngs(simplifiedLatLngs);
            }
            
            // Update vertex markers
            this.updateVertexMarkers(layer, simplifiedLatLngs);
        });
        
        
        const reduction = totalNodesBefore > 0 ? ((totalNodesBefore - totalNodesAfter) / totalNodesBefore * 100).toFixed(1) : 0;
        
        // Restore button state (reuse the variable declared earlier)
        if (simplifyBtn) {
            simplifyBtn.disabled = false;
            simplifyBtn.textContent = '📉 Simplify Geometry';
        }
        
        // Show success message with visual feedback
        const message = `✅ Geometry simplified!\n\nNodes before: ${totalNodesBefore}\nNodes after: ${totalNodesAfter}\nReduction: ${reduction}%`;
        alert(message);
    }

    savePreviewEdits() {
        if (!this.currentPreviewSequence) {
            alert('Error: No sequence loaded in preview.');
            return;
        }
        
        // Check if we have editable layers - if not, try to extract from map
        if (!this.editableLayers || this.editableLayers.length === 0) {
            console.warn('No editable layers found, trying to extract from map...');
            this.editableLayers = [];
            this.map.eachLayer((layer) => {
                if ((layer instanceof L.Polyline || layer instanceof L.Polygon || layer instanceof L.Marker) && 
                    !(layer instanceof L.TileLayer) && 
                    !layer._isVertexMarker &&
                    !layer._isDeleteButton) {
                    this.editableLayers.push(layer);
                }
            });
            
            if (this.editableLayers.length === 0) {
                alert('Error: No geometry found to save.\n\nPlease make sure:\n1. You have features visible in the preview\n2. Edit mode is enabled\n3. You have made some edits');
                return;
            }
            console.log('Found', this.editableLayers.length, 'layers from map');
        }
        
        console.log('Saving edits from', this.editableLayers.length, 'layers');
        
        // Convert edited layers back to GeoJSON features
        const editedFeatures = [];
        this.editableLayers.forEach((layer, idx) => {
            let geometry = null;
            
            try {
                if (layer instanceof L.Polyline) {
                    const latlngs = layer.getLatLngs();
                    const flatLatlngs = this.flattenLatLngs(latlngs);
                    
                    if (flatLatlngs.length > 0) {
                        const coords = flatLatlngs.map(ll => {
                            if (ll instanceof L.LatLng || (ll.lat !== undefined && ll.lng !== undefined)) {
                                return [ll.lng, ll.lat];
                            } else if (Array.isArray(ll) && ll.length >= 2) {
                                // Try to detect format: if first value > 90, it's probably lng
                                if (Math.abs(ll[0]) > 90) {
                                    return [ll[0], ll[1]]; // [lng, lat]
                                } else {
                                    return [ll[1], ll[0]]; // [lat, lng] -> [lng, lat]
                                }
                            }
                            return null;
                        }).filter(coord => coord !== null && coord[0] !== undefined && coord[1] !== undefined);
                        
                        if (coords.length >= 2) { // LineString needs at least 2 points
                            geometry = {
                                type: 'LineString',
                                coordinates: coords
                            };
                        }
                    }
                } else if (layer instanceof L.Polygon) {
                    const latlngs = layer.getLatLngs();
                    const flatLatlngs = this.flattenLatLngs(latlngs);
                    
                    if (flatLatlngs.length > 0) {
                        const coords = flatLatlngs.map(ll => {
                            if (ll instanceof L.LatLng || (ll.lat !== undefined && ll.lng !== undefined)) {
                                return [ll.lng, ll.lat];
                            } else if (Array.isArray(ll) && ll.length >= 2) {
                                if (Math.abs(ll[0]) > 90) {
                                    return [ll[0], ll[1]];
                                } else {
                                    return [ll[1], ll[0]];
                                }
                            }
                            return null;
                        }).filter(coord => coord !== null && coord[0] !== undefined && coord[1] !== undefined);
                        
                        // Close the polygon
                        if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
                            coords.push(coords[0]);
                        }
                        
                        if (coords.length >= 4) { // Polygon needs at least 4 points (closed ring)
                            geometry = {
                                type: 'Polygon',
                                coordinates: [coords]
                            };
                        }
                    }
                } else if (layer instanceof L.Marker) {
                    const latlng = layer.getLatLng();
                    if (latlng && latlng.lat !== undefined && latlng.lng !== undefined) {
                        geometry = {
                            type: 'Point',
                            coordinates: [latlng.lng, latlng.lat]
                        };
                    }
                }
                
                if (geometry) {
                    // Preserve original feature properties
                    const originalFeature = layer.feature || { properties: {} };
                    editedFeatures.push({
                        type: 'Feature',
                        geometry: geometry,
                        properties: originalFeature.properties || {}
                    });
                    console.log(`Layer ${idx}: Converted to ${geometry.type} with ${geometry.coordinates.length} coordinates`);
                } else {
                    console.warn(`Layer ${idx}: Could not extract valid geometry`);
                }
            } catch (error) {
                console.error(`Error processing layer ${idx}:`, error);
            }
        });
        
        if (editedFeatures.length === 0) {
            alert('Error: Could not extract any valid features from the edited layers.\n\nPlease try:\n1. Make sure edit mode is enabled\n2. Make sure you have geometry visible on the map\n3. Try reverting and re-editing');
            return;
        }
        
        console.log('Successfully saved', editedFeatures.length, 'features');
        
        // Update sequence features
        this.currentPreviewSequence.features = editedFeatures;
        
        // Update the sequence in the main sequences array
        const sequenceIndex = this.sequences.findIndex(s => s.id === this.currentPreviewSequence.id);
        if (sequenceIndex >= 0) {
            this.sequences[sequenceIndex].features = editedFeatures;
            // Also update stats
            const stats = this.calculateStats(editedFeatures);
            this.sequences[sequenceIndex].featureCount = stats.features;
            this.sequences[sequenceIndex].nodeCount = stats.nodes;
            this.sequences[sequenceIndex].wayCount = stats.ways;
        }
        
        // Save to storage
        this.saveToStorage();
        
        // Update original for revert
        this.originalPreviewFeatures = JSON.parse(JSON.stringify(editedFeatures));
        
        // Changes saved silently - no popup needed
    }

    revertPreviewEdits() {
        if (!this.currentPreviewSequence || !this.originalPreviewFeatures) return;
        
        const confirmed = confirm('Are you sure you want to revert all changes? This will restore the original geometry.');
        if (!confirmed) return;
        
        // Restore original features
        this.currentPreviewSequence.features = JSON.parse(JSON.stringify(this.originalPreviewFeatures));
        
        // Update the sequence in the main sequences array
        const sequenceIndex = this.sequences.findIndex(s => s.id === this.currentPreviewSequence.id);
        if (sequenceIndex >= 0) {
            this.sequences[sequenceIndex].features = JSON.parse(JSON.stringify(this.originalPreviewFeatures));
        }
        
        // Re-render the preview
        this.previewSequence(this.currentPreviewSequence.id);
        
        alert('✅ Changes reverted successfully!');
    }

    closePreview() {
        // Disable edit mode if active
        if (this.previewEditMode) {
            this.toggleEditMode();
        }
        
        // Clear node selection
        if (this.nodeSelectionMode) {
            this.toggleNodeSelectionMode();
        }
        this.clearNodeSelection();
        
        // Autosave edits when closing preview
        if (this.editableLayers && this.editableLayers.length > 0) {
            this.syncEditsToSequence();
        }
        
        // Clear undo/redo history when closing preview
        this.editHistory = [];
        this.currentHistoryIndex = -1;
        
        const modal = document.getElementById('previewModal');
        modal.style.display = 'none';
        this.currentPreviewSequence = null;
        this.previewEditMode = false;
        this.originalPreviewFeatures = null;
        this.editableLayers = [];
        // Clear oneway arrows
        this.onewayArrows.forEach(arrowLayer => {
            if (this.map && arrowLayer) {
                this.map.removeLayer(arrowLayer);
            }
        });
        this.onewayArrows.clear();
        
        // Invalidate map size when hidden
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    }

    // Way Selection and Tag Management
    selectWay(layer, addToSelection = false) {
        // Support multi-select if enabled
        if (this.multiSelectMode && addToSelection) {
            this.selectLayer(layer, true);
            return;
        }
        
        // Single select mode
        // Deselect previous way (but keep split segments highlighted)
        if (this.selectedWayLayer && this.selectedWayLayer !== layer) {
            // Only reset style if it's not a split segment
            if (!this.splitSegments || !this.splitSegments.includes(this.selectedWayLayer)) {
                this.selectedWayLayer.setStyle({ 
                    weight: 4, 
                    opacity: 0.8,
                    color: '#0066ff'
                });
            } else {
                // If it's a split segment, just remove dashArray to show it's not currently selected
                this.selectedWayLayer.setStyle({ 
                    weight: 6, 
                    opacity: 0.9,
                    color: '#0066ff',
                    dashArray: null
                });
            }
        }
        
        // Clear multi-select
        this.clearSelection();
        
        // Select new way
        this.selectedWayLayer = layer;
        layer.setStyle({ 
            weight: 6, 
            opacity: 0.9,
            color: '#0066ff',
            dashArray: '5, 5' // Dashed line for selected way
        });
        
        // Update tag editor with selected way's tags
        this.updateTagEditorForSelectedWay();
        this.updateSelectedWayInfo();
    }
    
    connectSelectedWays() {
        if (this.selectedLayers.length === 2) {
            const center = this.map.getCenter();
            this.connectWays(this.selectedLayers[0], this.selectedLayers[1], center);
            this.clearSelection();
        } else if (this.selectedWayLayer) {
            alert('Select exactly 2 ways to connect them. Use multi-select mode.');
        } else {
            alert('Select 2 ways to connect them.');
        }
    }
    
    mergeSelectedWays() {
        const ways = this.selectedLayers.length > 0 ? this.selectedLayers : 
                    (this.selectedWayLayer ? [this.selectedWayLayer] : []);
        
        if (ways.length < 2) {
            alert('Select at least 2 ways to merge.');
            return;
        }
        
        if (confirm(`Merge ${ways.length} ways into one?`)) {
            this.mergeWays(ways);
            this.clearSelection();
        }
    }
    
    updateTagEditorForSelectedWay() {
        if (!this.selectedWayLayer || !this.selectedWayLayer.feature) return;
        
        const feature = this.selectedWayLayer.feature;
        const highwayValue = feature.properties?.highway || 'unclassified';
        const onewayValue = feature.properties?.oneway || '';
        
        const highwaySelect = document.getElementById('highwaySelect');
        const onewaySelect = document.getElementById('onewaySelect');
        
        if (highwaySelect) highwaySelect.value = highwayValue;
        if (onewaySelect) onewaySelect.value = onewayValue;
    }
    
    updateSelectedWayInfo() {
        const infoElement = document.getElementById('selectedWayInfo');
        if (!infoElement) return;
        
        if (this.selectedWayLayer) {
            const feature = this.selectedWayLayer.feature;
            const highway = feature?.properties?.highway || 'unclassified';
            const oneway = feature?.properties?.oneway || '';
            
            let onewayDisplay = 'No';
            if (oneway === 'yes') {
                onewayDisplay = 'Yes (One-way forward)';
            } else if (oneway === '-1') {
                onewayDisplay = '-1 (One-way backward)';
            }
            
            infoElement.innerHTML = `Selected: <strong>highway=${highway}</strong>, <strong>oneway=${onewayDisplay}</strong>`;
        } else {
            infoElement.textContent = 'Click on a way to select and edit tags';
        }
    }
    
    updateSelectedWayTag(tagKey, tagValue) {
        if (!this.selectedWayLayer || !this.selectedWayLayer.feature) {
            alert('Please select a way first by clicking on it');
            return;
        }
        
        const feature = this.selectedWayLayer.feature;
        if (!feature.properties) {
            feature.properties = {};
        }
        
        if (tagKey === 'oneway' && tagValue === '') {
            delete feature.properties.oneway;
        } else {
            feature.properties[tagKey] = tagValue;
        }
        
        // Update the feature in the sequence
        if (this.currentPreviewSequence) {
            const featureIndex = this.currentPreviewSequence.features.findIndex(
                f => f === feature || (f.geometry && feature.geometry && 
                    JSON.stringify(f.geometry) === JSON.stringify(feature.geometry))
            );
            if (featureIndex >= 0) {
                this.currentPreviewSequence.features[featureIndex] = feature;
        }
        }
        
        // Update oneway arrows if oneway tag changed
        if (tagKey === 'oneway') {
            this.updateOnewayArrows();
        }
        
        // Update info display
        this.updateSelectedWayInfo();
        
        // Autosave: Sync edits to sequence immediately
        this.syncEditsToSequence();
        
        // Save to storage
        this.saveToStorage();
        
        // If in tag workflow step, check if all ways are tagged
        if (this.workflowStep === 'tag') {
            this.checkTaggingProgress();
        }
    }
    
    checkTaggingProgress() {
        // Check if all ways have highway tags
        const allTagged = this.editableLayers.every(layer => {
            if (!(layer instanceof L.Polyline) || !layer._isGpsTrace) return true;
            const feature = layer.feature;
            return feature?.properties?.highway;
        });
        
        if (allTagged && this.editableLayers.length > 0) {
            // All ways are tagged, suggest completing the step
            const completeBtn = document.getElementById('workflowCompleteBtn');
            if (completeBtn && !completeBtn.dataset.shown) {
                completeBtn.style.display = 'inline-block';
                completeBtn.dataset.shown = 'true';
            }
        }
    }
    
    addWorkflowCompleteButton(step, label) {
        // Remove existing button if any
        this.removeWorkflowCompleteButton();
        
        const controls = document.querySelector('.preview-mode-controls');
        if (!controls) return;
        
        const btn = document.createElement('button');
        btn.id = 'workflowCompleteBtn';
        btn.className = 'btn btn-primary';
        btn.textContent = `✓ Complete`; // Consistent label for all steps
        btn.onclick = () => {
            this.completeWorkflowStep(step);
            if (step === 'edit') {
                // Disable edit mode when completing
                if (this.previewEditMode) {
                    this.toggleEditMode();
                }
            } else if (step === 'split') {
                // Disable split mode when completing
                if (this.splitMode) {
                    this.toggleSplitMode();
                }
            }
            btn.remove();
        };
        btn.style.marginLeft = '10px';
        controls.appendChild(btn);
    }
    
    removeWorkflowCompleteButton() {
        const btn = document.getElementById('workflowCompleteBtn');
        if (btn) {
            btn.remove();
        }
    }
    
    toggleSplitMode() {
        this.splitMode = !this.splitMode;
        const splitBtn = document.getElementById('splitWayBtn');
        const splitBtnMain = document.getElementById('splitWayBtnMain');
        
        if (this.splitMode) {
            // Show instructions
            alert('Split Mode: Click on a GREEN node to split the way at that point. All nodes are shown for easy selection.');
            
            // Don't hide tag panel in split step - it contains the split button!
            // The tag panel visibility is controlled by workflow step, not by split mode
            
            // Show vertex markers for ALL GPS trace ways (not just selected)
            this.editableLayers.forEach(layer => {
                if ((layer instanceof L.Polyline || layer instanceof L.Polygon) && layer._isGpsTrace) {
                    const latlngs = this.flattenLatLngs(layer.getLatLngs());
                    this.updateVertexMarkers(layer, latlngs);
                }
            });
            
            if (splitBtn) {
                splitBtn.style.background = '#28a745';
                splitBtn.style.borderColor = '#28a745';
                splitBtn.textContent = '✂️ Exit Split Mode';
            }
            if (splitBtnMain) {
                splitBtnMain.style.background = '#28a745';
                splitBtnMain.style.borderColor = '#28a745';
                splitBtnMain.textContent = '✂️ Exit Split Mode';
            }
        } else {
            if (splitBtn) {
                splitBtn.style.background = '';
                splitBtn.style.borderColor = '';
                splitBtn.textContent = '✂️ Split Way';
            }
            if (splitBtnMain) {
                splitBtnMain.style.background = '';
                splitBtnMain.style.borderColor = '';
                splitBtnMain.textContent = '✂️ Split Way';
            }
            
            // Hide vertex markers if not in edit mode
            if (!this.previewEditMode) {
                this.editableLayers.forEach(layer => {
                    if (layer._vertexMarkers) {
                        layer._vertexMarkers.forEach(marker => {
                            if (this.map && marker) {
                                marker.off();
                                this.map.removeLayer(marker);
                            }
                        });
                        layer._vertexMarkers = [];
                    }
                });
            }
            
            // Remove workflow complete button if exists
            this.removeWorkflowCompleteButton();
        }
    }
    
    updateVertexMarkersForSelectedWay() {
        if (!this.selectedWayLayer || !(this.selectedWayLayer instanceof L.Polyline)) return;
        
        // Clear existing markers first
        if (this.selectedWayLayer._vertexMarkers) {
            this.selectedWayLayer._vertexMarkers.forEach(marker => {
                if (this.map && marker) {
                    marker.off(); // Remove event listeners
                    this.map.removeLayer(marker);
                }
            });
            this.selectedWayLayer._vertexMarkers = [];
        }
        
        const latlngs = this.flattenLatLngs(this.selectedWayLayer.getLatLngs());
        this.updateVertexMarkers(this.selectedWayLayer, latlngs);
    }
    
    hideVertexMarkersForSelectedWay() {
        if (!this.selectedWayLayer || !this.selectedWayLayer._vertexMarkers) return;
        
        this.selectedWayLayer._vertexMarkers.forEach(marker => {
            if (this.map && marker) {
                this.map.removeLayer(marker);
            }
        });
        this.selectedWayLayer._vertexMarkers = [];
    }
    
    splitWayAtNode(layer, nodeIndex) {
        if (!layer || !(layer instanceof L.Polyline)) return;
        
        const latlngs = this.flattenLatLngs(layer.getLatLngs());
        if (nodeIndex < 1 || nodeIndex >= latlngs.length - 1) {
            alert('Cannot split at the first or last node. Please select a middle node.');
            return;
        }
        
        // Visual feedback: briefly highlight the split point
        const splitNode = latlngs[nodeIndex];
        const splitMarker = L.marker([splitNode.lat || splitNode[0], splitNode.lng || splitNode[1]], {
            icon: L.divIcon({
                className: 'split-point-marker',
                html: '<div style="width: 30px; height: 30px; background: rgba(40, 167, 69, 0.6); border: 3px solid #28a745; border-radius: 50%; animation: pulse 1s;"></div>',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            }),
            zIndexOffset: 1200
        }).addTo(this.map);
        
        setTimeout(() => {
            if (this.map && splitMarker) {
                this.map.removeLayer(splitMarker);
            }
        }, 1000);
        
        // Save state before splitting
        this.saveStateToHistory();
        
        // Get original feature
        const originalFeature = layer.feature;
        const originalProps = originalFeature?.properties || {};
        
        // Create two segments
        const segment1LatLngs = latlngs.slice(0, nodeIndex + 1);
        const segment2LatLngs = latlngs.slice(nodeIndex);
        
        // Create first segment (keep original layer)
        layer.setLatLngs(segment1LatLngs);
        
        // Create second segment (new layer)
        const segment2Layer = L.polyline(segment2LatLngs, {
            color: '#0066ff',
            weight: 4,
            opacity: 0.8
        }).addTo(this.map);
        
        // Copy feature data to new segment
        segment2Layer.feature = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: segment2LatLngs.map(ll => {
                    if (ll instanceof L.LatLng) {
                        return [ll.lng, ll.lat];
                    }
                    return [ll[1] || ll.lng, ll[0] || ll.lat];
                })
            },
            properties: { ...originalProps } // Copy properties but can be edited separately
        };
        segment2Layer._isGpsTrace = true;
        
        // Add click handler for new segment (enabled in tag step)
        segment2Layer.on('click', (e) => {
            // Allow way selection in tag step, or if not in preview step and not in edit mode
            if ((this.workflowStep === 'tag') || (this.workflowStep !== 'preview' && !this.previewEditMode)) {
                if (!e.originalEvent.target.closest('.vertex-marker')) {
                    this.selectWay(segment2Layer);
                    e.originalEvent.stopPropagation();
                }
            }
        });
        
        // Add hover effects (enabled in tag step)
        segment2Layer.on('mouseover', () => {
            if (this.workflowStep === 'tag' || (this.workflowStep !== 'preview' && !this.previewEditMode && !this.splitMode)) {
                segment2Layer.setStyle({ weight: 6, opacity: 1.0 });
            }
        });
        
        segment2Layer.on('mouseout', () => {
            if (this.workflowStep === 'tag' || (this.workflowStep !== 'preview' && !this.previewEditMode && !this.splitMode)) {
                if (this.selectedWayLayer === segment2Layer) {
                    segment2Layer.setStyle({ weight: 6, opacity: 0.9, color: '#0066ff', dashArray: '5, 5' });
                } else {
                    segment2Layer.setStyle({ weight: 4, opacity: 0.8, color: '#0066ff' });
                }
            }
        });
        
        // Update original feature geometry
        if (layer.feature) {
            layer.feature.geometry = {
                type: 'LineString',
                coordinates: segment1LatLngs.map(ll => {
                    if (ll instanceof L.LatLng) {
                        return [ll.lng, ll.lat];
                    }
                    return [ll[1] || ll.lng, ll[0] || ll.lat];
                })
            };
        }
        
        // Add new segment to editable layers
        this.editableLayers.push(segment2Layer);
        
        // Add new feature to sequence
        if (this.currentPreviewSequence) {
            this.currentPreviewSequence.features.push(segment2Layer.feature);
        }
        
        // Update vertex markers for both segments
        if (this.previewEditMode || this.splitMode) {
            this.updateVertexMarkers(layer, segment1LatLngs);
            this.updateVertexMarkers(segment2Layer, segment2LatLngs);
        }
        
        // After splitting, highlight both segments so user can select and tag them separately
        // Select first segment (with dashed line to show it's selected)
        this.selectWay(layer);
        // Also highlight second segment (solid line to show it's available but not currently selected)
        segment2Layer.setStyle({
            weight: 6,
            opacity: 0.9,
            color: '#0066ff',
            dashArray: null // No dash = available but not selected
        });
        
        // Store both segments for reference
        this.splitSegments = [layer, segment2Layer];
        
        // Update markers for both segments if in split mode
        if (this.splitMode) {
            this.updateVertexMarkers(layer, segment1LatLngs);
            this.updateVertexMarkers(segment2Layer, segment2LatLngs);
        }
        
        // Show message about the split
        alert(`Way split successfully! Both segments are highlighted. You can continue splitting or click "Complete" to proceed to the Tag step.`);
    }

    toggleNodeSelectionMode() {
        this.nodeSelectionMode = !this.nodeSelectionMode;
        const nodeSelectBtn = document.getElementById('nodeSelectModeBtn');
        const createWayBtn = document.getElementById('createWayFromNodesBtn');
        
        if (this.nodeSelectionMode) {
            // Disable other modes
            if (this.splitMode) {
                this.toggleSplitMode();
            }
            if (this.previewEditMode) {
                this.toggleEditMode();
            }
            
            if (nodeSelectBtn) {
                nodeSelectBtn.style.background = '#28a745';
                nodeSelectBtn.style.borderColor = '#28a745';
                nodeSelectBtn.textContent = '🎯 Cancel Node Select';
            }
            
            // Clear previous selection
            this.clearNodeSelection();
            
            alert('Node Selection Mode: Click on nodes to select them. Selected nodes will be highlighted. Click "Create Way from Nodes" to create a new way.');
        } else {
            if (nodeSelectBtn) {
                nodeSelectBtn.style.background = '';
                nodeSelectBtn.style.borderColor = '';
                nodeSelectBtn.textContent = '🎯 Select Nodes';
            }
            if (createWayBtn) {
                createWayBtn.disabled = true;
            }
            
            this.clearNodeSelection();
        }
        
        this.updateNodeSelectionUI();
    }

    toggleNodeSelection(layer, nodeIndex, marker) {
        const latlngs = this.flattenLatLngs(layer.getLatLngs());
        const latlng = latlngs[nodeIndex];
        
        // Check if node is already selected
        const existingIndex = this.selectedNodes.findIndex(n => 
            n.layer === layer && n.nodeIndex === nodeIndex
        );
        
        if (existingIndex >= 0) {
            // Deselect node
            this.selectedNodes.splice(existingIndex, 1);
            this.updateNodeMarkerStyle(marker, false);
        } else {
            // Select node
            this.selectedNodes.push({
                layer: layer,
                nodeIndex: nodeIndex,
                latlng: latlng instanceof L.LatLng ? latlng : L.latLng(latlng.lat || latlng[0], latlng.lng || latlng[1])
            });
            this.updateNodeMarkerStyle(marker, true);
        }
        
        this.updateNodeSelectionUI();
    }

    updateNodeMarkerStyle(marker, isSelected) {
        if (!marker || !marker._icon) return;
        
        const handle = marker._icon.querySelector('.vertex-handle');
        if (handle) {
            if (isSelected) {
                handle.classList.add('node-selected');
                handle.style.background = '#ff8800';
                handle.style.borderColor = '#ffffff';
                handle.style.boxShadow = '0 2px 8px rgba(255, 136, 0, 0.6), 0 0 0 3px rgba(255, 136, 0, 0.3)';
                handle.style.transform = 'scale(1.4)';
            } else {
                handle.classList.remove('node-selected');
                handle.style.background = '';
                handle.style.borderColor = '';
                handle.style.boxShadow = '';
                handle.style.transform = '';
            }
        }
    }

    clearNodeSelection() {
        // Update all markers to remove selection styling
        this.selectedNodes.forEach(node => {
            const layer = node.layer;
            if (layer && layer._vertexMarkers && layer._vertexMarkers[node.nodeIndex]) {
                const marker = layer._vertexMarkers[node.nodeIndex];
                this.updateNodeMarkerStyle(marker, false);
            }
        });
        
        this.selectedNodes = [];
        this.updateNodeSelectionUI();
    }

    updateNodeSelectionUI() {
        const createWayBtn = document.getElementById('createWayFromNodesBtn');
        const selectionInfo = document.getElementById('selectionInfo');
        
        if (this.nodeSelectionMode) {
            if (selectionInfo) {
                selectionInfo.style.display = 'block';
                selectionInfo.textContent = `Selected ${this.selectedNodes.length} node(s). Select at least 2 nodes to create a way.`;
            }
            
            if (createWayBtn) {
                createWayBtn.disabled = this.selectedNodes.length < 2;
            }
        } else {
            if (selectionInfo) {
                selectionInfo.style.display = 'none';
            }
            if (createWayBtn) {
                createWayBtn.disabled = true;
            }
        }
    }

    createWayFromSelectedNodes() {
        if (this.selectedNodes.length < 2) {
            alert('Please select at least 2 nodes to create a way.');
            return;
        }
        
        // Sort nodes by their order in their respective ways
        // Group by layer first, then sort by nodeIndex within each layer
        const sortedNodes = [...this.selectedNodes].sort((a, b) => {
            if (a.layer !== b.layer) {
                // If different layers, maintain order (could be improved)
                return 0;
            }
            return a.nodeIndex - b.nodeIndex;
        });
        
        // Extract coordinates in order
        const coordinates = sortedNodes.map(node => {
            const latlng = node.latlng;
            if (latlng instanceof L.LatLng) {
                return [latlng.lng, latlng.lat];
            }
            return [latlng.lng || latlng[1], latlng.lat || latlng[0]];
        });
        
        // Get properties from first node's layer (or use defaults)
        const firstNode = sortedNodes[0];
        const sourceLayer = firstNode.layer;
        const sourceProps = sourceLayer?.feature?.properties || {};
        
        // Create new polyline layer
        const newLayer = L.polyline(coordinates.map(coord => [coord[1], coord[0]]), {
            color: '#0066ff',
            weight: 4,
            opacity: 0.8
        }).addTo(this.map);
        
        // Create feature for new layer
        newLayer.feature = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            },
            properties: { ...sourceProps } // Copy properties from source
        };
        newLayer._isGpsTrace = true;
        
        // Add click and hover handlers (disabled in preview step)
        newLayer.on('click', (e) => {
            if (this.workflowStep !== 'preview' && !this.previewEditMode && !e.originalEvent.target.closest('.vertex-marker')) {
                this.selectWay(newLayer);
                e.originalEvent.stopPropagation();
            }
        });
        
        newLayer.on('mouseover', () => {
            if (this.workflowStep !== 'preview' && !this.previewEditMode) {
                newLayer.setStyle({ weight: 6, opacity: 1.0 });
            }
        });
        
        newLayer.on('mouseout', () => {
            if (this.workflowStep !== 'preview' && !this.previewEditMode) {
                if (this.selectedWayLayer === newLayer) {
                    newLayer.setStyle({ weight: 6, opacity: 0.9, color: '#0066ff', dashArray: '5, 5' });
                } else {
                    newLayer.setStyle({ weight: 4, opacity: 0.8, color: '#0066ff' });
                }
            }
        });
        
        // Add to editable layers
        this.editableLayers.push(newLayer);
        
        // Add to sequence features
        if (this.currentPreviewSequence) {
            this.currentPreviewSequence.features.push(newLayer.feature);
        }
        
        // Update vertex markers if in edit mode
        if (this.previewEditMode) {
            const latlngs = coordinates.map(coord => L.latLng(coord[1], coord[0]));
            this.updateVertexMarkers(newLayer, latlngs);
        }
        
        // Save state
        this.saveStateToHistory();
        this.syncEditsToSequence();
        this.saveToStorage();
        
        // Clear selection
        this.clearNodeSelection();
        
        // Optionally disable node selection mode
        // this.toggleNodeSelectionMode();
        
        console.log(`Created new way from ${sortedNodes.length} selected nodes`);
        alert(`Created new way from ${sortedNodes.length} selected nodes!`);
    }

    updateOnewayArrows() {
        // Clear existing arrows
        this.onewayArrows.forEach(arrowLayer => {
            if (this.map && arrowLayer) {
                this.map.removeLayer(arrowLayer);
            }
        });
        this.onewayArrows.clear();
        
        if (!this.map || !this.editableLayers) return;
        
        // Render arrows for each way with oneway tag
        this.editableLayers.forEach((layer, wayIndex) => {
            if (!(layer instanceof L.Polyline) || !layer._isGpsTrace) return;
            
            // Get oneway value from feature
            const feature = layer.feature;
            const onewayValue = feature?.properties?.oneway;
            
            if (!onewayValue || onewayValue === 'no' || onewayValue === '') return;
            
            // Create arrow layer
            const latlngs = this.flattenLatLngs(layer.getLatLngs());
            if (latlngs.length < 2) return;
            
            // Create arrow markers along the way
            const arrowLayer = L.layerGroup();
            
            // Add arrows at regular intervals - more frequent for clarity
            const arrowSpacing = 30; // meters between arrows (reduced from 50 for better visibility)
            const totalLength = this.calculateWayLength(latlngs);
            const numArrows = Math.max(2, Math.floor(totalLength / arrowSpacing)); // At least 2 arrows
            
            for (let i = 0; i <= numArrows; i++) {
                const t = i / numArrows;
                const arrowLatLng = this.getPointAlongWay(latlngs, t);
                
                if (arrowLatLng) {
                    const arrow = this.createOnewayArrow(arrowLatLng, latlngs, onewayValue === '-1');
                    // Arrows are non-interactive to avoid blocking way clicks
                    // Users can toggle oneway via the tag panel instead
                    arrow.addTo(arrowLayer);
                }
            }
            
            arrowLayer.addTo(this.map);
            this.onewayArrows.set(wayIndex, arrowLayer);
        });
    }

    calculateWayLength(latlngs) {
        let totalLength = 0;
        for (let i = 0; i < latlngs.length - 1; i++) {
            const p1 = latlngs[i];
            const p2 = latlngs[i + 1];
            const lat1 = p1 instanceof L.LatLng ? p1.lat : p1[0];
            const lon1 = p1 instanceof L.LatLng ? p1.lng : p1[1];
            const lat2 = p2 instanceof L.LatLng ? p2.lat : p2[0];
            const lon2 = p2 instanceof L.LatLng ? p2.lng : p2[1];
            totalLength += this.calculateDistance(lat1, lon1, lat2, lon2);
        }
        return totalLength;
    }

    getPointAlongWay(latlngs, t) {
        if (latlngs.length < 2) return null;
        
        const totalLength = this.calculateWayLength(latlngs);
        let currentLength = 0;
        const targetLength = totalLength * t;
        
        for (let i = 0; i < latlngs.length - 1; i++) {
            const p1 = latlngs[i];
            const p2 = latlngs[i + 1];
            const lat1 = p1 instanceof L.LatLng ? p1.lat : p1[0];
            const lon1 = p1 instanceof L.LatLng ? p1.lng : p1[1];
            const lat2 = p2 instanceof L.LatLng ? p2.lat : p2[0];
            const lon2 = p2 instanceof L.LatLng ? p2.lng : p2[1];
            
            const segmentLength = this.calculateDistance(lat1, lon1, lat2, lon2);
            
            if (currentLength + segmentLength >= targetLength) {
                const segmentT = (targetLength - currentLength) / segmentLength;
                const lat = lat1 + (lat2 - lat1) * segmentT;
                const lon = lon1 + (lon2 - lon1) * segmentT;
                return L.latLng(lat, lon);
            }
            
            currentLength += segmentLength;
        }
        
        // Return last point if we've gone past the end
        const last = latlngs[latlngs.length - 1];
        return last instanceof L.LatLng ? last : L.latLng(last[0], last[1]);
    }

    createOnewayArrow(latlng, wayLatLngs, isBackward) {
        // Calculate direction from way geometry
        let direction = 0;
        if (wayLatLngs.length >= 2) {
            const idx = this.findClosestSegmentIndex(latlng, wayLatLngs);
            if (idx >= 0 && idx < wayLatLngs.length - 1) {
                const p1 = wayLatLngs[idx];
                const p2 = wayLatLngs[idx + 1];
                const lat1 = p1 instanceof L.LatLng ? p1.lat : p1[0];
                const lon1 = p1 instanceof L.LatLng ? p1.lng : p1[1];
                const lat2 = p2 instanceof L.LatLng ? p2.lat : p2[0];
                const lon2 = p2 instanceof L.LatLng ? p2.lng : p2[1];
                direction = Math.atan2(lat2 - lat1, lon2 - lon1) * 180 / Math.PI;
                // Reverse direction for backward arrows
                if (isBackward) {
                    direction = (direction + 180) % 360;
                }
            }
        }
        
        // Create arrow icon with shaft and arrowhead (like green arrow)
        const arrowColor = '#28a745'; // Green for all oneway arrows (forward and backward)
        const arrowSize = 28;
        const arrowStroke = 4;
        const shaftWidth = arrowSize * 0.3; // Width of the arrow shaft
        const shaftLength = arrowSize * 1.2; // Length of the arrow shaft
        const headWidth = arrowSize * 0.8; // Width of arrowhead
        const headLength = arrowSize * 0.6; // Length of arrowhead
        
        // Calculate direction text (N, NE, E, SE, S, SW, W, NW)
        const dirText = this.getDirectionText(direction);
        
        // Create arrow with shaft and arrowhead (single direction arrow - forward or backward)
        const arrowHtml = `<div style="position: relative;">
                <svg width="${arrowSize * 2.5}" height="${arrowSize * 2.5}" style="transform: rotate(${direction}deg);">
                    <!-- Arrow shaft -->
                    <rect x="${arrowSize * 1.25 - shaftWidth/2}" y="${arrowSize * 0.4}" 
                          width="${shaftWidth}" height="${shaftLength}" 
                          fill="${arrowColor}" stroke="white" stroke-width="${arrowStroke/2}" 
                          style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7));"/>
                    <!-- Arrowhead -->
                    <path d="M ${arrowSize * 1.25} ${arrowSize * 0.4} L ${arrowSize * 1.25 - headWidth/2} ${arrowSize * 0.4 + headLength} L ${arrowSize * 1.25 + headWidth/2} ${arrowSize * 0.4 + headLength} Z" 
                          fill="${arrowColor}" stroke="white" stroke-width="${arrowStroke}" 
                          style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.7));"/>
                </svg>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(${-direction}deg); 
                            font-size: 16px; font-weight: bold; color: white; text-shadow: 2px 2px 4px rgba(0,0,0,0.9);">${dirText}</div>
               </div>`;
        
        const arrow = L.marker(latlng, {
            icon: L.divIcon({
                className: 'oneway-arrow-marker',
                html: arrowHtml,
                interactive: false, // Make arrows non-interactive so they don't block way clicks
                iconSize: [arrowSize * 2.5, arrowSize * 2.5],
                iconAnchor: [arrowSize * 1.25, arrowSize * 1.25]
            }),
            interactive: false, // Make arrows non-interactive so they don't block way clicks
            zIndexOffset: 100 // Lower z-index so ways can be clicked through arrows
        });
        
        // No hover effect since arrows are non-interactive
        // (removed to prevent blocking way clicks)
        
        return arrow;
    }
    
    getDirectionText(degrees) {
        // Normalize degrees to 0-360
        let normalized = ((degrees % 360) + 360) % 360;
        
        // Map to 8 directions
        if (normalized >= 337.5 || normalized < 22.5) return '→';
        if (normalized >= 22.5 && normalized < 67.5) return '↗';
        if (normalized >= 67.5 && normalized < 112.5) return '↑';
        if (normalized >= 112.5 && normalized < 157.5) return '↖';
        if (normalized >= 157.5 && normalized < 202.5) return '←';
        if (normalized >= 202.5 && normalized < 247.5) return '↙';
        if (normalized >= 247.5 && normalized < 292.5) return '↓';
        if (normalized >= 292.5 && normalized < 337.5) return '↘';
        return '→';
    }

    findClosestSegmentIndex(latlng, wayLatLngs) {
        let closestIdx = 0;
        let minDist = Infinity;
        
        const lat = latlng instanceof L.LatLng ? latlng.lat : latlng[0];
        const lon = latlng instanceof L.LatLng ? latlng.lng : latlng[1];
        
        for (let i = 0; i < wayLatLngs.length - 1; i++) {
            const p1 = wayLatLngs[i];
            const p2 = wayLatLngs[i + 1];
            const lat1 = p1 instanceof L.LatLng ? p1.lat : p1[0];
            const lon1 = p1 instanceof L.LatLng ? p1.lng : p1[1];
            const lat2 = p2 instanceof L.LatLng ? p2.lat : p2[0];
            const lon2 = p2 instanceof L.LatLng ? p2.lng : p2[1];
            
            // Find closest point on segment using distanceToSegment helper
            const point = { lat: lat, lng: lon };
            const segStart = { lat: lat1, lng: lon1 };
            const segEnd = { lat: lat2, lng: lon2 };
            const dist = this.distanceToSegment(point, segStart, segEnd);
            
            if (dist < minDist) {
                minDist = dist;
                closestIdx = i;
            }
        }
        
        return closestIdx;
    }

    toggleOneway(wayIndex) {
        if (wayIndex < 0 || wayIndex >= this.editableLayers.length) return;
        
        const layer = this.editableLayers[wayIndex];
        if (!layer || !layer.feature) return;
        
        // Select the way first
        this.selectWay(layer);
        
        const currentValue = layer.feature.properties?.oneway || '';
        let newValue;
        
        if (currentValue === '') {
            newValue = 'yes';
        } else if (currentValue === 'yes') {
            newValue = '-1';
        } else {
            newValue = '';
        }
        
        // Update the selected way's tag
        this.updateSelectedWayTag('oneway', newValue);
    }

    async exportFromPreview() {
        if (this.currentPreviewSequence) {
            // Always sync current edited state to sequence before exporting (autosave)
            if (this.editableLayers && this.editableLayers.length > 0) {
                this.syncEditsToSequence();
            }
            
            // Export uses the current edited geometry
            await this.exportToJOSM(this.currentPreviewSequence.id);
        }
    }
    
    // Autosave: Sync current edited state from editableLayers to sequence
    syncEditsToSequence() {
        if (!this.currentPreviewSequence || !this.editableLayers || this.editableLayers.length === 0) {
            return;
        }
        
        // Convert edited layers back to GeoJSON features
        const editedFeatures = [];
        this.editableLayers.forEach((layer, idx) => {
            // Only process GPS trace layers
            if (!layer._isGpsTrace) return;
            
            let geometry = null;
            
            try {
                if (layer instanceof L.Polyline) {
                    const latlngs = this.flattenLatLngs(layer.getLatLngs());
                    
                    if (latlngs.length > 0) {
                        const coords = latlngs.map(ll => {
                            if (ll instanceof L.LatLng || (ll.lat !== undefined && ll.lng !== undefined)) {
                                return [ll.lng, ll.lat];
                            } else if (Array.isArray(ll) && ll.length >= 2) {
                                if (Math.abs(ll[0]) > 90) {
                                    return [ll[0], ll[1]]; // [lng, lat]
                                } else {
                                    return [ll[1], ll[0]]; // [lat, lng] -> [lng, lat]
                                }
                            }
                            return null;
                        }).filter(coord => coord !== null && coord[0] !== undefined && coord[1] !== undefined);
                        
                        if (coords.length >= 2) {
                            geometry = {
                                type: 'LineString',
                                coordinates: coords
                            };
                        }
                    }
                } else if (layer instanceof L.Polygon) {
                    const latlngs = this.flattenLatLngs(layer.getLatLngs());
                    
                    if (latlngs.length > 0) {
                        const coords = latlngs.map(ll => {
                            if (ll instanceof L.LatLng || (ll.lat !== undefined && ll.lng !== undefined)) {
                                return [ll.lng, ll.lat];
                            } else if (Array.isArray(ll) && ll.length >= 2) {
                                if (Math.abs(ll[0]) > 90) {
                                    return [ll[0], ll[1]];
                                } else {
                                    return [ll[1], ll[0]];
                                }
                            }
                            return null;
                        }).filter(coord => coord !== null && coord[0] !== undefined && coord[1] !== undefined);
                        
                        // Close the polygon
                        if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
                            coords.push(coords[0]);
                        }
                        
                        if (coords.length >= 4) {
                            geometry = {
                                type: 'Polygon',
                                coordinates: [coords]
                            };
                        }
                    }
                } else if (layer instanceof L.Marker) {
                    const latlng = layer.getLatLng();
                    if (latlng && latlng.lat !== undefined && latlng.lng !== undefined) {
                        geometry = {
                            type: 'Point',
                            coordinates: [latlng.lng, latlng.lat]
                        };
                    }
                }
                
                if (geometry) {
                    // Preserve original feature properties (including tags)
                    const originalFeature = layer.feature || { properties: {} };
                    editedFeatures.push({
                        type: 'Feature',
                        geometry: geometry,
                        properties: originalFeature.properties || {}
                    });
                }
            } catch (error) {
                console.error(`Error processing layer ${idx}:`, error);
            }
        });
        
        if (editedFeatures.length > 0) {
            // Update sequence features with current edited state
            this.currentPreviewSequence.features = editedFeatures;
            
            // Update the sequence in the main sequences array
            const sequenceIndex = this.sequences.findIndex(s => s.id === this.currentPreviewSequence.id);
            if (sequenceIndex >= 0) {
                this.sequences[sequenceIndex].features = editedFeatures;
                // Also update stats
                const stats = this.calculateStats(editedFeatures);
                this.sequences[sequenceIndex].featureCount = stats.features;
                this.sequences[sequenceIndex].nodeCount = stats.nodes;
                this.sequences[sequenceIndex].wayCount = stats.ways;
            }
            
            // Save to storage
            this.saveToStorage();
        }
    }

    updateSummary() {
        const total = this.sequences.length;
        const active = this.sequences.filter(seq => !seq.status || seq.status === '').length;
        const skipped = this.sequences.filter(seq => seq.status === 'skipped').length;
        const done = this.sequences.filter(seq => seq.status === 'done').length;

        // Update new stat cards (new UI)
        const statTotal = document.getElementById('statTotal');
        const statActive = document.getElementById('statActive');
        const statDone = document.getElementById('statDone');
        const statSkipped = document.getElementById('statSkipped');
        
        if (statTotal) statTotal.textContent = total;
        if (statActive) statActive.textContent = active;
        if (statDone) statDone.textContent = done;
        if (statSkipped) statSkipped.textContent = skipped;

        // Also update old format for backward compatibility
        const summaryInfo = document.getElementById('summaryInfo');
        if (summaryInfo && !statTotal) {
            summaryInfo.innerHTML = `
                <span>Total Sequences: ${total}</span>
                <span>Active: ${active}</span>
                <span>Skipped: ${skipped}</span>
                <span>Done: ${done}</span>
            `;
        }
    }

    async saveToStorage() {
        try {
            // Save id and status to IndexedDB
            const taskData = {
                sequences: this.sequences.map(seq => ({
                    id: seq.id,
                    status: seq.status
                })),
                currentIndex: this.currentIndex,
                currentView: this.currentView
            };
            
            await storageManager.saveTaskData(taskData);
            
            // Also save geojsonData to IndexedDB for full functionality
            if (this.geojsonData) {
                await storageManager.saveGeoJSONData(this.geojsonData);
            }
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }

    exportAllToCSV() {
        const allSequences = this.getAllSequences();
        
        if (allSequences.length === 0) {
            alert('No sequences to export.');
            return;
        }

        // Create CSV content
        const headers = ['Sequence ID', 'Status'];
        const rows = allSequences.map(seq => {
            const status = seq.status || 'Active (Blank)';
            // Escape commas and quotes in sequence ID
            const sequenceId = String(seq.id).replace(/"/g, '""');
            return `"${sequenceId}","${status}"`;
        });

        const csvContent = [
            headers.join(','),
            ...rows
        ].join('\n');

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `OSMAGIC_Tasks_Export_${timestamp}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Show success message
        alert(`✅ Successfully exported ${allSequences.length} sequences to ${filename}`);
    }

    async clearAllData() {
        // Show confirmation dialog
        const confirmed = confirm(
            '⚠️ WARNING: This will permanently delete ALL data including:\n\n' +
            '• All sequence IDs\n' +
            '• All status information\n' +
            '• All GeoJSON/GPX/CSV data\n' +
            '• All progress and metadata\n\n' +
            'This action CANNOT be undone!\n\n' +
            'Are you sure you want to clear all data?'
        );

        if (!confirmed) {
            return;
        }

        try {
            // Clear IndexedDB
            await storageManager.clearAll();

            // Reset all state
            this.geojsonData = null;
            this.sequences = [];
            this.currentIndex = 0;
            this.currentView = 'all';
            this.navigatingToSequenceId = null;
            this.currentPreviewSequence = null;

            // Clear file input
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.value = '';
            }

            // Clear file info
            const fileInfo = document.getElementById('fileInfo');
            if (fileInfo) {
                fileInfo.textContent = '';
            }

            // Reset tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                if (btn.dataset.view === 'all') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Update UI
            this.renderCurrentTask();
            this.updateSummary();

            // Show success message
            alert('✅ All data has been cleared successfully!');
        } catch (error) {
            console.error('Error clearing data:', error);
            alert('❌ Error clearing data. Please try again or check the console for details.');
        }
    }

    async loadFromStorage() {
        try {
            // Load task data from IndexedDB
            const taskData = await storageManager.loadTaskData();
            if (!taskData) return;

            // Load geojsonData from IndexedDB
            this.geojsonData = await storageManager.loadGeoJSONData();

            if (taskData.sequences && Array.isArray(taskData.sequences)) {
                // Restore only id and status from storage
                // If geojsonData exists, recalculate stats from features
                if (this.geojsonData && this.geojsonData.features) {
                    // Recalculate stats from geojsonData
                    const sequenceMap = new Map();
                    
                    this.geojsonData.features.forEach((feature) => {
                        const sequenceId = String(
                            feature.properties?.sequence_id || 
                            feature.properties?.sequenceId || 
                            feature.properties?.sequence || 
                            feature.properties?.id ||
                            feature.properties?.seq ||
                            `sequence_${feature.properties?.id || Math.random().toString(36).substr(2, 9)}`
                        );

                        if (!sequenceMap.has(sequenceId)) {
                            sequenceMap.set(sequenceId, {
                                id: sequenceId,
                                features: []
                            });
                        }

                        sequenceMap.get(sequenceId).features.push(feature);
                    });

                    // Restore status from saved data and calculate stats
                    const savedStatusMap = new Map();
                    taskData.sequences.forEach(seq => {
                        savedStatusMap.set(String(seq.id), seq.status);
                    });

                    this.sequences = Array.from(sequenceMap.values()).map(seq => {
                        const stats = this.calculateStats(seq.features);
                        return {
                            ...seq,
                            status: savedStatusMap.get(String(seq.id)) || '',
                            featureCount: stats.features,
                            nodeCount: stats.nodes,
                            wayCount: stats.ways,
                            date: new Date().toLocaleDateString()
                        };
                    });

                    // Sort by sequence ID
                    this.sequences.sort((a, b) => {
                        const aNum = parseInt(a.id);
                        const bNum = parseInt(b.id);
                        if (!isNaN(aNum) && !isNaN(bNum)) {
                            return aNum - bNum;
                        }
                        return a.id.localeCompare(b.id);
                    });
                } else {
                    // No geojsonData available, just restore basic structure
                    this.sequences = taskData.sequences.map(seq => ({
                        id: seq.id,
                        status: seq.status || '',
                        features: [],
                        featureCount: 0,
                        nodeCount: 0,
                        wayCount: 0,
                        date: new Date().toLocaleDateString()
                    }));
                }
                
                this.currentIndex = taskData.currentIndex || 0;
                this.currentView = taskData.currentView || 'all';
                
                // Update tab buttons to reflect current view
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    if (btn.dataset.view === this.currentView) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                
                if (this.sequences.length > 0) {
                    this.renderCurrentTask();
                    this.updateSummary();
                }
            }
        } catch (error) {
            console.error('Error loading from storage:', error);
        }
    }

    // ============================================
    // MULTI-SELECT FEATURES
    // ============================================
    
    toggleMultiSelectMode() {
        this.multiSelectMode = !this.multiSelectMode;
        if (!this.multiSelectMode) {
            // Clear selection when disabling
            this.clearSelection();
        }
        this.updateMultiSelectUI();
    }
    
    updateMultiSelectUI() {
        // Update UI to show multi-select state
        const btn = document.getElementById('toggleMultiSelectBtn');
        if (btn) {
            btn.textContent = this.multiSelectMode ? '🔲 Disable Multi-Select' : '☑️ Enable Multi-Select';
            btn.style.background = this.multiSelectMode ? '#28a745' : '';
        }
    }
    
    selectLayer(layer, addToSelection = false) {
        if (!addToSelection || !this.multiSelectMode) {
            this.clearSelection();
        }
        
        if (!this.selectedLayers.includes(layer)) {
            this.selectedLayers.push(layer);
            layer.setStyle({
                weight: 6,
                opacity: 0.9,
                color: '#ff6600',
                dashArray: '5, 5'
            });
        }
        
        this.updateSelectionInfo();
    }
    
    deselectLayer(layer) {
        const index = this.selectedLayers.indexOf(layer);
        if (index > -1) {
            this.selectedLayers.splice(index, 1);
            layer.setStyle({
                weight: 4,
                opacity: 0.8,
                color: '#0066ff'
            });
        }
        this.updateSelectionInfo();
    }
    
    clearSelection() {
        this.selectedLayers.forEach(layer => {
            layer.setStyle({
                weight: 4,
                opacity: 0.8,
                color: '#0066ff'
            });
        });
        this.selectedLayers = [];
        this.selectedWayLayer = null;
        this.updateSelectionInfo();
    }
    
    updateSelectionInfo() {
        const count = this.selectedLayers.length;
        const info = document.getElementById('selectionInfo');
        if (info) {
            info.textContent = count > 0 ? `${count} way(s) selected` : 'No selection';
        }
    }
    
    selectAllConnected(wayLayer) {
        if (!wayLayer || !wayLayer._isGpsTrace) return;
        
        const latlngs = this.flattenLatLngs(wayLayer.getLatLngs());
        const connectedLayers = new Set([wayLayer]);
        
        // Find all ways that share nodes with this way
        this.editableLayers.forEach(layer => {
            if (layer === wayLayer || !layer._isGpsTrace) return;
            const otherLatlngs = this.flattenLatLngs(layer.getLatLngs());
            
            // Check if any nodes are shared (within tolerance)
            const tolerance = 0.00001; // ~1 meter
            for (const ll1 of latlngs) {
                const lat1 = ll1 instanceof L.LatLng ? ll1.lat : ll1[0];
                const lon1 = ll1 instanceof L.LatLng ? ll1.lng : ll1[1];
                
                for (const ll2 of otherLatlngs) {
                    const lat2 = ll2 instanceof L.LatLng ? ll2.lat : ll2[0];
                    const lon2 = ll2 instanceof L.LatLng ? ll2.lng : ll2[1];
                    
                    const dist = Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2));
                    if (dist < tolerance) {
                        connectedLayers.add(layer);
                        break;
                    }
                }
            }
        });
        
        this.clearSelection();
        connectedLayers.forEach(layer => this.selectLayer(layer, true));
    }
    
    selectByTag(tagKey, tagValue) {
        const matchingLayers = [];
        this.editableLayers.forEach(layer => {
            if (layer._isGpsTrace && layer.feature && layer.feature.properties) {
                const value = layer.feature.properties[tagKey];
                if (value === tagValue || (tagValue === '' && !value)) {
                    matchingLayers.push(layer);
                }
            }
        });
        
        this.clearSelection();
        matchingLayers.forEach(layer => this.selectLayer(layer, true));
    }
    
    // ============================================
    // WAY OPERATIONS
    // ============================================
    
    connectWays(way1, way2, nodeLatLng) {
        if (!way1 || !way2 || way1 === way2) return false;
        if (!way1._isGpsTrace || !way2._isGpsTrace) return false;
        
        this.saveStateToHistory();
        
        const latlngs1 = this.flattenLatLngs(way1.getLatLngs());
        const latlngs2 = this.flattenLatLngs(way2.getLatLngs());
        
        // Find closest nodes in each way
        let closestIdx1 = -1;
        let closestIdx2 = -1;
        let minDist1 = Infinity;
        let minDist2 = Infinity;
        
        const lat = nodeLatLng instanceof L.LatLng ? nodeLatLng.lat : nodeLatLng[0];
        const lon = nodeLatLng instanceof L.LatLng ? nodeLatLng.lng : nodeLatLng[1];
        
        latlngs1.forEach((ll, idx) => {
            const llat = ll instanceof L.LatLng ? ll.lat : ll[0];
            const llon = ll instanceof L.LatLng ? ll.lng : ll[1];
            const dist = Math.sqrt(Math.pow(llat - lat, 2) + Math.pow(llon - lon, 2));
            if (dist < minDist1) {
                minDist1 = dist;
                closestIdx1 = idx;
            }
        });
        
        latlngs2.forEach((ll, idx) => {
            const llat = ll instanceof L.LatLng ? ll.lat : ll[0];
            const llon = ll instanceof L.LatLng ? ll.lng : ll[1];
            const dist = Math.sqrt(Math.pow(llat - lat, 2) + Math.pow(llon - lon, 2));
            if (dist < minDist2) {
                minDist2 = dist;
                closestIdx2 = idx;
            }
        });
        
        if (closestIdx1 === -1 || closestIdx2 === -1) return false;
        
        // Merge nodes: use the connection point
        const mergedNode = L.latLng(lat, lon);
        latlngs1[closestIdx1] = mergedNode;
        latlngs2[closestIdx2] = mergedNode;
        
        way1.setLatLngs(way1 instanceof L.Polygon ? [latlngs1] : latlngs1);
        way2.setLatLngs(way2 instanceof L.Polygon ? [latlngs2] : latlngs2);
        
        this.updateVertexMarkers(way1, latlngs1);
        this.updateVertexMarkers(way2, latlngs2);
        
        return true;
    }
    
    disconnectWays(way, nodeIndex) {
        if (!way || !way._isGpsTrace) return false;
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        if (nodeIndex < 0 || nodeIndex >= latlngs.length) return false;
        
        // Check if this node is shared with other ways
        const nodeLatLng = latlngs[nodeIndex];
        const lat = nodeLatLng instanceof L.LatLng ? nodeLatLng.lat : nodeLatLng[0];
        const lon = nodeLatLng instanceof L.LatLng ? nodeLatLng.lng : nodeLatLng[1];
        
        const tolerance = 0.00001;
        let sharedCount = 0;
        
        this.editableLayers.forEach(layer => {
            if (layer === way || !layer._isGpsTrace) return;
            const otherLatlngs = this.flattenLatLngs(layer.getLatLngs());
            otherLatlngs.forEach(ll => {
                const llat = ll instanceof L.LatLng ? ll.lat : ll[0];
                const llon = ll instanceof L.LatLng ? ll.lng : ll[1];
                const dist = Math.sqrt(Math.pow(llat - lat, 2) + Math.pow(llon - lon, 2));
                if (dist < tolerance) sharedCount++;
            });
        });
        
        if (sharedCount > 0) {
            // Split the node: create a new node slightly offset
            const offset = 0.000001; // ~0.1 meter
            const newLatLng = L.latLng(lat + offset, lon + offset);
            latlngs[nodeIndex] = newLatLng;
            
            this.saveStateToHistory();
            way.setLatLngs(way instanceof L.Polygon ? [latlngs] : latlngs);
            this.updateVertexMarkers(way, latlngs);
            return true;
        }
        
        return false;
    }
    
    reverseWayDirection(way) {
        if (!way || !way._isGpsTrace) return;
        
        this.saveStateToHistory();
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        latlngs.reverse();
        
        way.setLatLngs(way instanceof L.Polygon ? [latlngs] : latlngs);
        this.updateVertexMarkers(way, latlngs);
        
        // Update oneway tag if present
        if (way.feature && way.feature.properties) {
            const oneway = way.feature.properties.oneway;
            if (oneway === 'yes') {
                way.feature.properties.oneway = '-1';
            } else if (oneway === '-1') {
                way.feature.properties.oneway = 'yes';
            }
            this.updateOnewayArrows();
        }
    }
    
    mergeWays(ways) {
        if (!ways || ways.length < 2) return false;
        
        this.saveStateToHistory();
        
        // Combine all nodes
        const allNodes = [];
        const allTags = {};
        
        ways.forEach(way => {
            if (!way._isGpsTrace) return;
            const latlngs = this.flattenLatLngs(way.getLatLngs());
            allNodes.push(...latlngs);
            
            if (way.feature && way.feature.properties) {
                Object.assign(allTags, way.feature.properties);
            }
        });
        
        // Remove duplicate consecutive nodes
        const cleanedNodes = [];
        const tolerance = 0.00001;
        allNodes.forEach((node, idx) => {
            if (idx === 0) {
                cleanedNodes.push(node);
            } else {
                const prev = cleanedNodes[cleanedNodes.length - 1];
                const prevLat = prev instanceof L.LatLng ? prev.lat : prev[0];
                const prevLon = prev instanceof L.LatLng ? prev.lng : prev[1];
                const currLat = node instanceof L.LatLng ? node.lat : node[0];
                const currLon = node instanceof L.LatLng ? node.lng : node[1];
                const dist = Math.sqrt(Math.pow(prevLat - currLat, 2) + Math.pow(prevLon - currLon, 2));
                if (dist > tolerance) {
                    cleanedNodes.push(node);
                }
            }
        });
        
        if (cleanedNodes.length < 2) return false;
        
        // Use first way as the merged way
        const mergedWay = ways[0];
        mergedWay.setLatLngs(mergedWay instanceof L.Polygon ? [cleanedNodes] : cleanedNodes);
        
        // Update tags
        if (mergedWay.feature) {
            if (!mergedWay.feature.properties) mergedWay.feature.properties = {};
            Object.assign(mergedWay.feature.properties, allTags);
        }
        
        // Remove other ways
        for (let i = 1; i < ways.length; i++) {
            const way = ways[i];
            const index = this.editableLayers.indexOf(way);
            if (index > -1) {
                this.map.removeLayer(way);
                this.editableLayers.splice(index, 1);
            }
        }
        
        this.updateVertexMarkers(mergedWay, cleanedNodes);
        this.updateOnewayArrows();
        return true;
    }
    
    // ============================================
    // NODE OPERATIONS
    // ============================================
    
    addNodeToWay(way, segmentIndex, latlng) {
        if (!way || !way._isGpsTrace) return false;
        
        this.saveStateToHistory();
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        if (segmentIndex < 0 || segmentIndex >= latlngs.length - 1) return false;
        
        const newNode = latlng instanceof L.LatLng ? latlng : L.latLng(latlng[0], latlng[1]);
        latlngs.splice(segmentIndex + 1, 0, newNode);
        
        way.setLatLngs(way instanceof L.Polygon ? [latlngs] : latlngs);
        this.updateVertexMarkers(way, latlngs);
        return true;
    }
    
    removeNodeFromWay(way, nodeIndex) {
        if (!way || !way._isGpsTrace) return false;
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        if (latlngs.length <= 2) {
            alert('Cannot remove node. A way must have at least 2 points.');
            return false;
        }
        
        this.saveStateToHistory();
        latlngs.splice(nodeIndex, 1);
        way.setLatLngs(way instanceof L.Polygon ? [latlngs] : latlngs);
        this.updateVertexMarkers(way, latlngs);
        return true;
    }
    
    mergeNodes(layer, nodeIndex1, nodeIndex2) {
        if (!layer || !layer._isGpsTrace) return false;
        
        const latlngs = this.flattenLatLngs(layer.getLatLngs());
        if (nodeIndex1 < 0 || nodeIndex1 >= latlngs.length ||
            nodeIndex2 < 0 || nodeIndex2 >= latlngs.length ||
            nodeIndex1 === nodeIndex2) return false;
        
        this.saveStateToHistory();
        
        // Use position of first node
        const node1 = latlngs[nodeIndex1];
        const lat1 = node1 instanceof L.LatLng ? node1.lat : node1[0];
        const lon1 = node1 instanceof L.LatLng ? node1.lng : node1[1];
        
        // Remove second node
        latlngs.splice(nodeIndex2, 1);
        
        // Update first node position (average if needed)
        latlngs[nodeIndex1] = L.latLng(lat1, lon1);
        
        layer.setLatLngs(layer instanceof L.Polygon ? [latlngs] : latlngs);
        this.updateVertexMarkers(layer, latlngs);
        return true;
    }
    
    // ============================================
    // GEOMETRY OPERATIONS
    // ============================================
    
    copyFeatures(layers) {
        if (!layers || layers.length === 0) {
            layers = this.selectedLayers.length > 0 ? this.selectedLayers : 
                     (this.selectedWayLayer ? [this.selectedWayLayer] : []);
        }
        
        if (layers.length === 0) {
            alert('No features selected to copy.');
            return;
        }
        
        this.clipboard = layers.map(layer => {
            if (!layer._isGpsTrace) return null;
            const latlngs = this.flattenLatLngs(layer.getLatLngs());
            return {
                type: layer instanceof L.Polygon ? 'Polygon' : 'Polyline',
                latlngs: latlngs.map(ll => {
                    const lat = ll instanceof L.LatLng ? ll.lat : ll[0];
                    const lon = ll instanceof L.LatLng ? ll.lng : ll[1];
                    return [lat, lon];
                }),
                properties: layer.feature ? {...layer.feature.properties} : {}
            };
        }).filter(f => f !== null);
        
        // Update paste button
        const pasteBtn = document.getElementById('pasteFeaturesBtn');
        if (pasteBtn) {
            pasteBtn.disabled = false;
            pasteBtn.style.opacity = '1';
        }
    }
    
    pasteFeatures(centerLatLng) {
        if (!this.clipboard || this.clipboard.length === 0) {
            alert('No features in clipboard to paste.');
            return;
        }
        
        this.saveStateToHistory();
        
        const centerLat = centerLatLng instanceof L.LatLng ? centerLatLng.lat : centerLatLng[0];
        const centerLon = centerLatLng instanceof L.LatLng ? centerLatLng.lng : centerLatLng[1];
        
        // Calculate center of clipboard features
        let clipboardCenterLat = 0;
        let clipboardCenterLon = 0;
        let totalPoints = 0;
        
        this.clipboard.forEach(feature => {
            feature.latlngs.forEach(([lat, lon]) => {
                clipboardCenterLat += lat;
                clipboardCenterLon += lon;
                totalPoints++;
            });
        });
        
        if (totalPoints > 0) {
            clipboardCenterLat /= totalPoints;
            clipboardCenterLon /= totalPoints;
        }
        
        // Calculate offset
        const offsetLat = centerLat - clipboardCenterLat;
        const offsetLon = centerLon - clipboardCenterLon;
        
        // Create new features with offset
        this.clipboard.forEach(feature => {
            const newLatlngs = feature.latlngs.map(([lat, lon]) => 
                L.latLng(lat + offsetLat, lon + offsetLon)
            );
            
            const geoJson = {
                type: 'Feature',
                geometry: {
                    type: feature.type === 'Polygon' ? 'Polygon' : 'LineString',
                    coordinates: feature.type === 'Polygon' ? 
                        [newLatlngs.map(ll => [ll.lng, ll.lat])] :
                        newLatlngs.map(ll => [ll.lng, ll.lat])
                },
                properties: {...feature.properties}
            };
            
            // Add to sequence
            if (this.currentPreviewSequence) {
                this.currentPreviewSequence.features.push(geoJson);
            }
            
            // Create layer
            const layer = feature.type === 'Polygon' ?
                L.polygon(newLatlngs, {color: '#0066ff', weight: 4, opacity: 0.8}) :
                L.polyline(newLatlngs, {color: '#0066ff', weight: 4, opacity: 0.8});
            
            layer.feature = geoJson;
            layer._isGpsTrace = true;
            layer.addTo(this.map);
            this.editableLayers.push(layer);
            
            // Add vertex markers if in edit mode
            if (this.previewEditMode) {
                this.updateVertexMarkers(layer, newLatlngs);
            }
        });
        
        this.saveToStorage();
    }
    
    rotateFeatures(layers, centerLatLng, angleDegrees) {
        if (!layers || layers.length === 0) {
            layers = this.selectedLayers.length > 0 ? this.selectedLayers : 
                     (this.selectedWayLayer ? [this.selectedWayLayer] : []);
        }
        
        if (layers.length === 0) {
            alert('No features selected to rotate.');
            return;
        }
        
        this.saveStateToHistory();
        
        const centerLat = centerLatLng instanceof L.LatLng ? centerLatLng.lat : centerLatLng[0];
        const centerLon = centerLatLng instanceof L.LatLng ? centerLatLng.lng : centerLatLng[1];
        const angleRad = angleDegrees * Math.PI / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        
        layers.forEach(layer => {
            if (!layer._isGpsTrace) return;
            const latlngs = this.flattenLatLngs(layer.getLatLngs());
            
            const rotatedLatlngs = latlngs.map(ll => {
                const lat = ll instanceof L.LatLng ? ll.lat : ll[0];
                const lon = ll instanceof L.LatLng ? ll.lng : ll[1];
                
                // Translate to origin
                const dx = lon - centerLon;
                const dy = lat - centerLat;
                
                // Rotate
                const rotatedX = dx * cos - dy * sin;
                const rotatedY = dx * sin + dy * cos;
                
                // Translate back
                return L.latLng(centerLat + rotatedY, centerLon + rotatedX);
            });
            
            layer.setLatLngs(layer instanceof L.Polygon ? [rotatedLatlngs] : rotatedLatlngs);
            this.updateVertexMarkers(layer, rotatedLatlngs);
        });
    }
    
    scaleFeatures(layers, centerLatLng, scaleFactor) {
        if (!layers || layers.length === 0) {
            layers = this.selectedLayers.length > 0 ? this.selectedLayers : 
                     (this.selectedWayLayer ? [this.selectedWayLayer] : []);
        }
        
        if (layers.length === 0) {
            alert('No features selected to scale.');
            return;
        }
        
        this.saveStateToHistory();
        
        const centerLat = centerLatLng instanceof L.LatLng ? centerLatLng.lat : centerLatLng[0];
        const centerLon = centerLatLng instanceof L.LatLng ? centerLatLng.lng : centerLatLng[1];
        
        layers.forEach(layer => {
            if (!layer._isGpsTrace) return;
            const latlngs = this.flattenLatLngs(layer.getLatLngs());
            
            const scaledLatlngs = latlngs.map(ll => {
                const lat = ll instanceof L.LatLng ? ll.lat : ll[0];
                const lon = ll instanceof L.LatLng ? ll.lng : ll[1];
                
                const newLat = centerLat + (lat - centerLat) * scaleFactor;
                const newLon = centerLon + (lon - centerLon) * scaleFactor;
                
                return L.latLng(newLat, newLon);
            });
            
            layer.setLatLngs(layer instanceof L.Polygon ? [scaledLatlngs] : scaledLatlngs);
            this.updateVertexMarkers(layer, scaledLatlngs);
        });
    }
    
    moveFeatures(layers, offsetLat, offsetLon) {
        if (!layers || layers.length === 0) {
            layers = this.selectedLayers.length > 0 ? this.selectedLayers : 
                     (this.selectedWayLayer ? [this.selectedWayLayer] : []);
        }
        
        if (layers.length === 0) {
            alert('No features selected to move.');
            return;
        }
        
        this.saveStateToHistory();
        
        layers.forEach(layer => {
            if (!layer._isGpsTrace) return;
            const latlngs = this.flattenLatLngs(layer.getLatLngs());
            
            const movedLatlngs = latlngs.map(ll => {
                const lat = ll instanceof L.LatLng ? ll.lat : ll[0];
                const lon = ll instanceof L.LatLng ? ll.lng : ll[1];
                return L.latLng(lat + offsetLat, lon + offsetLon);
            });
            
            layer.setLatLngs(layer instanceof L.Polygon ? [movedLatlngs] : movedLatlngs);
            this.updateVertexMarkers(layer, movedLatlngs);
        });
    }
    
    // ============================================
    // TAG MANAGEMENT
    // ============================================
    
    applyTagPreset(layer, presetName) {
        if (!layer || !layer._isGpsTrace) return;
        
        const preset = this.tagPresets[presetName] || 
                      this.customTagPresets.find(p => p.name === presetName);
        
        if (!preset) {
            alert(`Preset "${presetName}" not found.`);
            return;
        }
        
        const tags = preset.tags || preset;
        if (!layer.feature) layer.feature = {properties: {}};
        if (!layer.feature.properties) layer.feature.properties = {};
        
        Object.assign(layer.feature.properties, tags);
        
        // Update tag editor if this is selected
        if (this.selectedWayLayer === layer) {
            this.updateTagEditorForSelectedWay();
        }
        
        this.updateOnewayArrows();
        this.saveToStorage();
    }
    
    createCustomTagPreset(name, tags) {
        if (!name || !tags) return false;
        
        const preset = {name, tags: {...tags}};
        this.customTagPresets.push(preset);
        localStorage.setItem('customTagPresets', JSON.stringify(this.customTagPresets));
        return true;
    }
    
    getTagSuggestions(layer) {
        if (!layer || !layer._isGpsTrace) return [];
        
        const suggestions = [];
        const latlngs = this.flattenLatLngs(layer.getLatLngs());
        
        // Suggest based on length
        const length = this.calculateWayLength(latlngs);
        if (length < 50) {
            suggestions.push({highway: 'service'});
        } else if (length < 200) {
            suggestions.push({highway: 'residential'});
        } else {
            suggestions.push({highway: 'unclassified'});
        }
        
        return suggestions;
    }
    
    bulkEditTags(layers, tagKey, tagValue) {
        if (!layers || layers.length === 0) {
            layers = this.selectedLayers.length > 0 ? this.selectedLayers : [];
        }
        
        if (layers.length === 0) {
            alert('No ways selected for bulk editing.');
            return;
        }
        
        this.saveStateToHistory();
        
        layers.forEach(layer => {
            if (!layer._isGpsTrace || !layer.feature) return;
            if (!layer.feature.properties) layer.feature.properties = {};
            
            if (tagValue === '' || tagValue === null) {
                delete layer.feature.properties[tagKey];
            } else {
                layer.feature.properties[tagKey] = tagValue;
            }
        });
        
        this.updateOnewayArrows();
        this.saveToStorage();
    }
    
    // ============================================
    // VALIDATION & QUALITY
    // ============================================
    
    validateWay(way) {
        const issues = [];
        if (!way || !way._isGpsTrace) return issues;
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        
        // Check for duplicate consecutive nodes
        for (let i = 0; i < latlngs.length - 1; i++) {
            const ll1 = latlngs[i];
            const ll2 = latlngs[i + 1];
            const lat1 = ll1 instanceof L.LatLng ? ll1.lat : ll1[0];
            const lon1 = ll1 instanceof L.LatLng ? ll1.lng : ll1[1];
            const lat2 = ll2 instanceof L.LatLng ? ll2.lat : ll2[0];
            const lon2 = ll2 instanceof L.LatLng ? ll2.lng : ll2[1];
            
            const dist = Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2));
            if (dist < 0.000001) {
                issues.push({type: 'duplicate_node', index: i});
            }
        }
        
        // Check for self-intersection (simplified)
        if (latlngs.length > 3) {
            for (let i = 0; i < latlngs.length - 1; i++) {
                for (let j = i + 2; j < latlngs.length - 1; j++) {
                    const seg1Start = latlngs[i];
                    const seg1End = latlngs[i + 1];
                    const seg2Start = latlngs[j];
                    const seg2End = latlngs[j + 1];
                    
                    if (this.segmentsIntersect(seg1Start, seg1End, seg2Start, seg2End)) {
                        issues.push({type: 'self_intersection', segment1: i, segment2: j});
                    }
                }
            }
        }
        
        return issues;
    }
    
    segmentsIntersect(p1, p2, p3, p4) {
        // Simplified line segment intersection check
        const x1 = p1 instanceof L.LatLng ? p1.lng : p1[1];
        const y1 = p1 instanceof L.LatLng ? p1.lat : p1[0];
        const x2 = p2 instanceof L.LatLng ? p2.lng : p2[1];
        const y2 = p2 instanceof L.LatLng ? p2.lat : p2[0];
        const x3 = p3 instanceof L.LatLng ? p3.lng : p3[1];
        const y3 = p3 instanceof L.LatLng ? p3.lat : p3[0];
        const x4 = p4 instanceof L.LatLng ? p4.lng : p4[1];
        const y4 = p4 instanceof L.LatLng ? p4.lat : p4[0];
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return false;
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }
    
    validateTags(layer) {
        const issues = [];
        if (!layer || !layer.feature || !layer.feature.properties) return issues;
        
        const props = layer.feature.properties;
        
        // Check for conflicting tags
        if (props.highway === 'motorway' && props.oneway !== 'yes' && props.oneway !== '-1') {
            issues.push({type: 'missing_oneway', message: 'Motorways should typically be oneway'});
        }
        
        if (props.highway === 'path' && props.oneway) {
            issues.push({type: 'unusual_oneway', message: 'Paths rarely have oneway restrictions'});
        }
        
        return issues;
    }
    
    checkGeometryQuality(layer) {
        const issues = [];
        if (!layer || !layer._isGpsTrace) return issues;
        
        const latlngs = this.flattenLatLngs(layer.getLatLngs());
        
        // Check for very short segments
        for (let i = 0; i < latlngs.length - 1; i++) {
            const ll1 = latlngs[i];
            const ll2 = latlngs[i + 1];
            const dist = this.calculateDistance(ll1, ll2);
            if (dist < 0.5) { // Less than 0.5 meters
                issues.push({type: 'very_short_segment', index: i, length: dist});
            }
        }
        
        // Check for sharp angles
        for (let i = 1; i < latlngs.length - 1; i++) {
            const p1 = latlngs[i - 1];
            const p2 = latlngs[i];
            const p3 = latlngs[i + 1];
            
            const angle = this.calculateAngle(p1, p2, p3);
            if (angle < 15 || angle > 165) { // Very sharp angle
                issues.push({type: 'sharp_angle', index: i, angle: angle});
            }
        }
        
        return issues;
    }
    
    calculateAngle(p1, p2, p3) {
        const lat1 = p1 instanceof L.LatLng ? p1.lat : p1[0];
        const lon1 = p1 instanceof L.LatLng ? p1.lng : p1[1];
        const lat2 = p2 instanceof L.LatLng ? p2.lat : p2[0];
        const lon2 = p2 instanceof L.LatLng ? p2.lng : p2[1];
        const lat3 = p3 instanceof L.LatLng ? p3.lat : p3[0];
        const lon3 = p3 instanceof L.LatLng ? p3.lng : p3[1];
        
        const a1 = Math.atan2(lat2 - lat1, lon2 - lon1) * 180 / Math.PI;
        const a2 = Math.atan2(lat3 - lat2, lon3 - lon2) * 180 / Math.PI;
        let angle = Math.abs(a2 - a1);
        if (angle > 180) angle = 360 - angle;
        return angle;
    }
    
    // ============================================
    // UI ENHANCEMENTS
    // ============================================
    
    initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }
            
            const ctrl = e.ctrlKey || e.metaKey;
            
            // Ctrl+Z / Cmd+Z - Undo
            if (ctrl && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (this.previewEditMode) this.undo();
            }
            
            // Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y - Redo
            if ((ctrl && e.shiftKey && e.key === 'z') || (ctrl && e.key === 'y')) {
                e.preventDefault();
                if (this.previewEditMode) this.redo();
            }
            
            // Ctrl+C - Copy
            if (ctrl && e.key === 'c') {
                e.preventDefault();
                this.copyFeatures();
            }
            
            // Ctrl+V - Paste
            if (ctrl && e.key === 'v') {
                e.preventDefault();
                if (this.map && this.clipboard) {
                    const center = this.map.getCenter();
                    this.pasteFeatures(center);
                }
            }
            
            // Delete key - Delete selected
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedLayers.length > 0 || this.selectedWayLayer) {
                    e.preventDefault();
                    this.deleteSelectedFeatures();
                }
            }
        });
    }
    
    deleteSelectedFeatures() {
        const layersToDelete = this.selectedLayers.length > 0 ? this.selectedLayers : 
                              (this.selectedWayLayer ? [this.selectedWayLayer] : []);
        
        if (layersToDelete.length === 0) return;
        
        if (!confirm(`Delete ${layersToDelete.length} feature(s)?`)) return;
        
        this.saveStateToHistory();
        
        layersToDelete.forEach(layer => {
            const index = this.editableLayers.indexOf(layer);
            if (index > -1) {
                this.map.removeLayer(layer);
                this.editableLayers.splice(index, 1);
                
                // Remove from sequence
                if (this.currentPreviewSequence && layer.feature) {
                    const featureIndex = this.currentPreviewSequence.features.indexOf(layer.feature);
                    if (featureIndex > -1) {
                        this.currentPreviewSequence.features.splice(featureIndex, 1);
                    }
                }
            }
        });
        
        this.clearSelection();
        this.saveToStorage();
    }
    
    showContextMenu(e, layer) {
        e.preventDefault();
        e.stopPropagation();
        
        // Remove existing context menu
        const existing = document.getElementById('contextMenu');
        if (existing) existing.remove();
        
        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'contextMenu';
        menu.style.cssText = `
            position: fixed;
            left: ${e.clientX}px;
            top: ${e.clientY}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 10000;
            padding: 4px 0;
            min-width: 150px;
        `;
        
        const items = [
            {text: 'Copy', action: () => this.copyFeatures([layer])},
            {text: 'Reverse Direction', action: () => this.reverseWayDirection(layer)},
            {text: 'Delete', action: () => this.deleteSelectedFeatures()}
        ];
        
        items.forEach(item => {
            const div = document.createElement('div');
            div.textContent = item.text;
            div.style.cssText = 'padding: 8px 16px; cursor: pointer;';
            div.onmouseover = () => div.style.background = '#f0f0f0';
            div.onmouseout = () => div.style.background = '';
            div.onclick = () => {
                item.action();
                menu.remove();
            };
            menu.appendChild(div);
        });
        
        document.body.appendChild(menu);
        
        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    toggleMeasurementMode() {
        this.measurementMode = !this.measurementMode;
        
        if (this.measurementMode) {
            this.measurementPoints = [];
            if (this.measurementLayer) {
                this.map.removeLayer(this.measurementLayer);
            }
            this.measurementLayer = L.layerGroup().addTo(this.map);
            
            this.map.on('click', this._measurementClickHandler = (e) => {
                this.measurementPoints.push(e.latlng);
                this.updateMeasurementDisplay();
            });
        } else {
            if (this._measurementClickHandler) {
                this.map.off('click', this._measurementClickHandler);
            }
        }
    }
    
    updateMeasurementDisplay() {
        if (!this.measurementLayer) return;
        
        this.measurementLayer.clearLayers();
        
        if (this.measurementPoints.length === 0) return;
        
        // Draw points
        this.measurementPoints.forEach((point, idx) => {
            L.marker(point, {
                icon: L.divIcon({
                    className: 'measurement-point',
                    html: `<div style="background: red; width: 8px; height: 8px; border-radius: 50%; border: 2px solid white;"></div>`,
                    iconSize: [12, 12]
                })
            }).addTo(this.measurementLayer);
        });
        
        // Draw line if 2+ points
        if (this.measurementPoints.length >= 2) {
            L.polyline(this.measurementPoints, {color: 'red', weight: 2}).addTo(this.measurementLayer);
            
            // Calculate total distance
            let totalDist = 0;
            for (let i = 0; i < this.measurementPoints.length - 1; i++) {
                totalDist += this.calculateDistance(this.measurementPoints[i], this.measurementPoints[i + 1]);
            }
            
            // Show distance label
            const midPoint = this.measurementPoints[Math.floor(this.measurementPoints.length / 2)];
            L.marker(midPoint, {
                icon: L.divIcon({
                    className: 'measurement-label',
                    html: `<div style="background: white; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;">${totalDist.toFixed(2)}m</div>`,
                    iconSize: [100, 30]
                })
            }).addTo(this.measurementLayer);
        }
    }
    
    searchFeatures(query) {
        this.searchResults = [];
        
        if (!query || query.trim() === '') return [];
        
        const searchLower = query.toLowerCase();
        
        this.editableLayers.forEach((layer, index) => {
            if (!layer._isGpsTrace || !layer.feature) return;
            
            // Search by ID
            if (String(index).includes(searchLower)) {
                this.searchResults.push({layer, index, match: 'ID'});
                return;
            }
            
            // Search by tags
            if (layer.feature.properties) {
                Object.entries(layer.feature.properties).forEach(([key, value]) => {
                    if (key.toLowerCase().includes(searchLower) || 
                        String(value).toLowerCase().includes(searchLower)) {
                        this.searchResults.push({layer, index, match: `${key}=${value}`});
                    }
                });
            }
        });
        
        return this.searchResults;
    }
    
    toggleLayerVisibility(layerType) {
        this.layerVisibility[layerType] = !this.layerVisibility[layerType];
        
        if (layerType === 'gpsTraces') {
            this.editableLayers.forEach(layer => {
                if (layer._isGpsTrace) {
                    if (this.layerVisibility.gpsTraces) {
                        layer.addTo(this.map);
                    } else {
                        this.map.removeLayer(layer);
                    }
                }
            });
        } else if (layerType === 'osmData') {
            if (this.osmDataLayer) {
                if (this.layerVisibility.osmData) {
                    this.osmDataLayer.addTo(this.map);
                } else {
                    this.map.removeLayer(this.osmDataLayer);
                }
            }
        } else if (layerType === 'onewayArrows') {
            this.onewayArrows.forEach(arrowLayer => {
                if (this.layerVisibility.onewayArrows) {
                    arrowLayer.addTo(this.map);
                } else {
                    this.map.removeLayer(arrowLayer);
                }
            });
        }
    }
    
    // ============================================
    // ADVANCED FEATURES
    // ============================================
    
    circularizeWay(way) {
        if (!way || !way._isGpsTrace) return;
        
        this.saveStateToHistory();
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        if (latlngs.length < 3) return;
        
        // Calculate center
        let centerLat = 0;
        let centerLon = 0;
        latlngs.forEach(ll => {
            centerLat += ll instanceof L.LatLng ? ll.lat : ll[0];
            centerLon += ll instanceof L.LatLng ? ll.lng : ll[1];
        });
        centerLat /= latlngs.length;
        centerLon /= latlngs.length;
        
        // Calculate average radius
        let totalRadius = 0;
        latlngs.forEach(ll => {
            const lat = ll instanceof L.LatLng ? ll.lat : ll[0];
            const lon = ll instanceof L.LatLng ? ll.lng : ll[1];
            const dist = this.calculateDistance([centerLat, centerLon], [lat, lon]);
            totalRadius += dist;
        });
        const radius = totalRadius / latlngs.length;
        
        // Create circular way
        const numPoints = Math.max(latlngs.length, 16);
        const circularLatlngs = [];
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            const lat = centerLat + (radius / 111320) * Math.cos(angle);
            const lon = centerLon + (radius / (111320 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle);
            circularLatlngs.push(L.latLng(lat, lon));
        }
        
        way.setLatLngs(way instanceof L.Polygon ? [circularLatlngs] : circularLatlngs);
        this.updateVertexMarkers(way, circularLatlngs);
    }
    
    orthogonalizeWay(way) {
        if (!way || !way._isGpsTrace) return;
        
        this.saveStateToHistory();
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        if (latlngs.length < 3) return;
        
        const orthogonalized = [latlngs[0]];
        
        for (let i = 1; i < latlngs.length - 1; i++) {
            const prev = orthogonalized[orthogonalized.length - 1];
            const curr = latlngs[i];
            const next = latlngs[i + 1];
            
            const prevLat = prev instanceof L.LatLng ? prev.lat : prev[0];
            const prevLon = prev instanceof L.LatLng ? prev.lng : prev[1];
            const currLat = curr instanceof L.LatLng ? curr.lat : curr[0];
            const currLon = curr instanceof L.LatLng ? curr.lng : curr[1];
            const nextLat = next instanceof L.LatLng ? next.lat : next[0];
            const nextLon = next instanceof L.LatLng ? next.lng : next[1];
            
            // Calculate angles
            const angle1 = Math.atan2(currLat - prevLat, currLon - prevLon);
            const angle2 = Math.atan2(nextLat - currLat, nextLon - currLon);
            
            // Round to nearest 90 degrees
            const avgAngle = (angle1 + angle2) / 2;
            const roundedAngle = Math.round(avgAngle / (Math.PI / 2)) * (Math.PI / 2);
            
            // Calculate new position
            const dist = this.calculateDistance(prev, curr);
            const newLat = prevLat + (dist / 111320) * Math.sin(roundedAngle);
            const newLon = prevLon + (dist / (111320 * Math.cos(prevLat * Math.PI / 180))) * Math.cos(roundedAngle);
            
            orthogonalized.push(L.latLng(newLat, newLon));
        }
        
        orthogonalized.push(latlngs[latlngs.length - 1]);
        
        way.setLatLngs(way instanceof L.Polygon ? [orthogonalized] : orthogonalized);
        this.updateVertexMarkers(way, orthogonalized);
    }
    
    smoothWay(way, factor = 0.5) {
        if (!way || !way._isGpsTrace) return;
        
        this.saveStateToHistory();
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        if (latlngs.length < 3) return;
        
        const smoothed = [latlngs[0]];
        
        for (let i = 1; i < latlngs.length - 1; i++) {
            const prev = latlngs[i - 1];
            const curr = latlngs[i];
            const next = latlngs[i + 1];
            
            const prevLat = prev instanceof L.LatLng ? prev.lat : prev[0];
            const prevLon = prev instanceof L.LatLng ? prev.lng : prev[1];
            const currLat = curr instanceof L.LatLng ? curr.lat : curr[0];
            const currLon = curr instanceof L.LatLng ? curr.lng : curr[1];
            const nextLat = next instanceof L.LatLng ? next.lat : next[0];
            const nextLon = next instanceof L.LatLng ? next.lng : next[1];
            
            // Average with neighbors
            const newLat = currLat + factor * ((prevLat + nextLat) / 2 - currLat);
            const newLon = currLon + factor * ((prevLon + nextLon) / 2 - currLon);
            
            smoothed.push(L.latLng(newLat, newLon));
        }
        
        smoothed.push(latlngs[latlngs.length - 1]);
        
        way.setLatLngs(way instanceof L.Polygon ? [smoothed] : smoothed);
        this.updateVertexMarkers(way, smoothed);
    }
    
    alignWays(ways, alignTo) {
        if (!ways || ways.length < 2) return;
        if (!alignTo || !alignTo._isGpsTrace) return;
        
        this.saveStateToHistory();
        
        const alignLatlngs = this.flattenLatLngs(alignTo.getLatLngs());
        if (alignLatlngs.length < 2) return;
        
        // Calculate reference angle from first segment
        const refStart = alignLatlngs[0];
        const refEnd = alignLatlngs[1];
        const refLat1 = refStart instanceof L.LatLng ? refStart.lat : refStart[0];
        const refLon1 = refStart instanceof L.LatLng ? refStart.lng : refStart[1];
        const refLat2 = refEnd instanceof L.LatLng ? refEnd.lat : refEnd[0];
        const refLon2 = refEnd instanceof L.LatLng ? refEnd.lng : refEnd[1];
        const refAngle = Math.atan2(refLat2 - refLat1, refLon2 - refLon1);
        
        ways.forEach(way => {
            if (way === alignTo || !way._isGpsTrace) return;
            
            const latlngs = this.flattenLatLngs(way.getLatLngs());
            if (latlngs.length < 2) return;
            
            const wayStart = latlngs[0];
            const wayEnd = latlngs[latlngs.length - 1];
            const wayLat1 = wayStart instanceof L.LatLng ? wayStart.lat : wayStart[0];
            const wayLon1 = wayStart instanceof L.LatLng ? wayStart.lng : wayStart[1];
            const wayLat2 = wayEnd instanceof L.LatLng ? wayEnd.lat : wayEnd[0];
            const wayLon2 = wayEnd instanceof L.LatLng ? wayEnd.lng : wayEnd[1];
            
            const wayAngle = Math.atan2(wayLat2 - wayLat1, wayLon2 - wayLon1);
            const angleDiff = refAngle - wayAngle;
            
            // Rotate way to match reference angle
            const centerLat = (wayLat1 + wayLat2) / 2;
            const centerLon = (wayLon1 + wayLon2) / 2;
            
            const rotated = latlngs.map(ll => {
                const lat = ll instanceof L.LatLng ? ll.lat : ll[0];
                const lon = ll instanceof L.LatLng ? ll.lng : ll[1];
                
                const dx = lon - centerLon;
                const dy = lat - centerLat;
                
                const newLon = centerLon + dx * Math.cos(angleDiff) - dy * Math.sin(angleDiff);
                const newLat = centerLat + dx * Math.sin(angleDiff) + dy * Math.cos(angleDiff);
                
                return L.latLng(newLat, newLon);
            });
            
            way.setLatLngs(way instanceof L.Polygon ? [rotated] : rotated);
            this.updateVertexMarkers(way, rotated);
        });
    }
    
    offsetWay(way, distance) {
        if (!way || !way._isGpsTrace) return null;
        
        const latlngs = this.flattenLatLngs(way.getLatLngs());
        if (latlngs.length < 2) return null;
        
        this.saveStateToHistory();
        
        const offsetLatlngs = [];
        const offsetMeters = distance / 111320; // Convert meters to degrees (approximate)
        
        for (let i = 0; i < latlngs.length; i++) {
            const curr = latlngs[i];
            const currLat = curr instanceof L.LatLng ? curr.lat : curr[0];
            const currLon = curr instanceof L.LatLng ? curr.lng : curr[1];
            
            let angle = 0;
            if (i === 0) {
                // First point: use angle to next point
                const next = latlngs[i + 1];
                const nextLat = next instanceof L.LatLng ? next.lat : next[0];
                const nextLon = next instanceof L.LatLng ? next.lng : next[1];
                angle = Math.atan2(nextLat - currLat, nextLon - currLon) + Math.PI / 2;
            } else if (i === latlngs.length - 1) {
                // Last point: use angle from previous point
                const prev = latlngs[i - 1];
                const prevLat = prev instanceof L.LatLng ? prev.lat : prev[0];
                const prevLon = prev instanceof L.LatLng ? prev.lng : prev[1];
                angle = Math.atan2(currLat - prevLat, currLon - prevLon) + Math.PI / 2;
            } else {
                // Middle point: average angle
                const prev = latlngs[i - 1];
                const next = latlngs[i + 1];
                const prevLat = prev instanceof L.LatLng ? prev.lat : prev[0];
                const prevLon = prev instanceof L.LatLng ? prev.lng : prev[1];
                const nextLat = next instanceof L.LatLng ? next.lat : next[0];
                const nextLon = next instanceof L.LatLng ? next.lng : next[1];
                
                const angle1 = Math.atan2(currLat - prevLat, currLon - prevLon) + Math.PI / 2;
                const angle2 = Math.atan2(nextLat - currLat, nextLon - currLon) + Math.PI / 2;
                angle = (angle1 + angle2) / 2;
            }
            
            const newLat = currLat + offsetMeters * Math.sin(angle);
            const newLon = currLon + offsetMeters * Math.cos(angle) / Math.cos(currLat * Math.PI / 180);
            
            offsetLatlngs.push(L.latLng(newLat, newLon));
        }
        
        // Create new way
        const geoJson = {
            type: 'Feature',
            geometry: {
                type: way instanceof L.Polygon ? 'Polygon' : 'LineString',
                coordinates: way instanceof L.Polygon ?
                    [offsetLatlngs.map(ll => [ll.lng, ll.lat])] :
                    offsetLatlngs.map(ll => [ll.lng, ll.lat])
            },
            properties: way.feature ? {...way.feature.properties} : {}
        };
        
        if (this.currentPreviewSequence) {
            this.currentPreviewSequence.features.push(geoJson);
        }
        
        const newLayer = way instanceof L.Polygon ?
            L.polygon(offsetLatlngs, {color: '#0066ff', weight: 4, opacity: 0.8}) :
            L.polyline(offsetLatlngs, {color: '#0066ff', weight: 4, opacity: 0.8});
        
        newLayer.feature = geoJson;
        newLayer._isGpsTrace = true;
        newLayer.addTo(this.map);
        this.editableLayers.push(newLayer);
        
        if (this.previewEditMode) {
            this.updateVertexMarkers(newLayer, offsetLatlngs);
        }
        
        this.saveToStorage();
        return newLayer;
    }

    // Workflow Management Functions
    updateWorkflowUI() {
        const steps = ['preview', 'edit', 'split', 'tag'];
        
        steps.forEach((step, index) => {
            const stepEl = document.getElementById(`workflowStep${index + 1}`);
            if (!stepEl) return;
            
            const isCompleted = this.workflowCompleted[step];
            const isCurrent = this.workflowStep === step;
            const isEnabled = index === 0 || this.workflowCompleted[steps[index - 1]];
            
            // Update step appearance
            stepEl.classList.remove('active', 'completed', 'disabled');
            if (isCurrent) {
                stepEl.classList.add('active');
            } else if (isCompleted) {
                stepEl.classList.add('completed');
            } else if (!isEnabled) {
                stepEl.classList.add('disabled');
            }
            
            // Update status indicator
            const statusEl = stepEl.querySelector('.step-status');
            const actionBtn = stepEl.querySelector('.step-action-btn');
            
            if (isCompleted) {
                // Show tick for completed steps (consistent with step 1)
                if (statusEl) {
                    statusEl.textContent = '✓';
                    statusEl.style.display = 'flex';
                }
                // Show "Revisit" button for completed steps to allow going back
                if (actionBtn) {
                    actionBtn.style.display = 'inline-block';
                    actionBtn.textContent = 'Revisit';
                    actionBtn.disabled = false;
                    actionBtn.onclick = () => {
                        this.startWorkflowStep(step);
                    };
                }
            } else if (isCurrent) {
                // Hide status indicator for current step (show button instead)
                if (statusEl) {
                    statusEl.textContent = '';
                    statusEl.style.display = 'none';
                }
                if (actionBtn) {
                    // Show "Complete" button for active steps
                    actionBtn.style.display = 'inline-block';
                    actionBtn.textContent = 'Complete';
                    actionBtn.disabled = false;
                    actionBtn.onclick = () => {
                        this.completeWorkflowStep(step);
                        if (step === 'edit' && this.previewEditMode) {
                            this.toggleEditMode();
                        } else if (step === 'split' && this.splitMode) {
                            this.toggleSplitMode();
                        }
                    };
                }
            } else {
                // Hide status indicator for pending steps
                if (statusEl) {
                    statusEl.textContent = '';
                    statusEl.style.display = 'none';
                }
                if (actionBtn) {
                    // Show "Start" button for pending steps
                    actionBtn.style.display = 'inline-block';
                    actionBtn.textContent = 'Start';
                    actionBtn.disabled = !isEnabled;
                }
            }
        });
    }

    startWorkflowStep(step) {
        if (step === 'preview') {
            // Preview is always active when modal opens
            return;
        }
        
        // Allow going back to completed steps - only check if step is not completed
        const stepOrder = ['preview', 'edit', 'split', 'tag'];
        const currentIndex = stepOrder.indexOf(step);
        const isStepCompleted = this.workflowCompleted[step];
        
        // Only enforce previous step completion if this step hasn't been completed yet
        if (!isStepCompleted && currentIndex > 0 && !this.workflowCompleted[stepOrder[currentIndex - 1]]) {
            alert(`Please complete the ${stepOrder[currentIndex - 1]} step first.`);
            return;
        }
        
        this.workflowStep = step;
        this.updateWorkflowUI();
        
        if (step === 'edit') {
            // Ensure we're in edit workflow step
            this.workflowStep = 'edit';
            this.updateWorkflowUI();
            
            // Hide tag editor panel (step 4 feature)
            const tagEditorPanel = document.getElementById('tagEditorPanel');
            if (tagEditorPanel) {
                tagEditorPanel.style.display = 'none';
            }
            
            // Hide split button (step 3 feature)
            const splitBtn = document.getElementById('splitWayBtn');
            const splitBtnMain = document.getElementById('splitWayBtnMain');
            if (splitBtn) splitBtn.style.display = 'none';
            if (splitBtnMain) splitBtnMain.style.display = 'none';
            
            // Disable split mode if active (step 3 feature)
            if (this.splitMode) {
                this.toggleSplitMode();
            }
            
            // Show edit mode buttons (step 2 features)
            document.getElementById('simplifyBtn').style.display = 'inline-block';
            document.getElementById('toleranceInput').style.display = 'inline-block';
            document.getElementById('undoBtn').style.display = 'inline-block';
            document.getElementById('redoBtn').style.display = 'inline-block';
            document.getElementById('toggleEditModeBtn').style.display = 'inline-block';
            
            // Enable edit mode
            if (!this.previewEditMode) {
                this.toggleEditMode();
            }
            
            // Ensure UI is updated after all setup to show the Complete button
            // Use setTimeout to ensure DOM updates are complete
            setTimeout(() => {
                this.updateWorkflowUI();
            }, 0);
            
            alert('📝 Edit Step: Drag nodes to adjust geometry, use "Simplify Geometry" to reduce nodes. When finished, click "Complete" button in the workflow panel.');
        } else if (step === 'split') {
            // Ensure we're in split workflow step
            this.workflowStep = 'split';
            this.updateWorkflowUI();
            
            // HIDE tag editor panel completely in split step (tagging is step 4 only)
            const tagEditorPanel = document.getElementById('tagEditorPanel');
            if (tagEditorPanel) {
                tagEditorPanel.style.display = 'none';
            }
            
            // Show split button in the main control bar
            const splitBtn = document.getElementById('splitWayBtn');
            if (splitBtn) {
                splitBtn.style.display = 'inline-flex';
            }
            
            // Hide the split button in tag panel (not needed in split step)
            const splitBtnMain = document.getElementById('splitWayBtnMain');
            if (splitBtnMain) {
                splitBtnMain.style.display = 'none';
            }
            
            // Hide edit mode buttons (step 2 features)
            document.getElementById('simplifyBtn').style.display = 'none';
            document.getElementById('toleranceInput').style.display = 'none';
            document.getElementById('toggleEditModeBtn').style.display = 'none';
            
            // Show undo/redo buttons for split step (to undo splits)
            document.getElementById('undoBtn').style.display = 'inline-flex';
            document.getElementById('redoBtn').style.display = 'inline-flex';
            
            // Initialize undo/redo history if not already done
            if (!this.history || this.history.length === 0) {
                this.initializeHistory();
            }
            
            // Disable edit mode if active
            if (this.previewEditMode) {
                this.toggleEditMode();
            }
            
            // Ensure UI is updated after all setup to show the Complete button
            // Use setTimeout to ensure DOM updates are complete
            setTimeout(() => {
                this.updateWorkflowUI();
            }, 0);
            
            alert('✂️ Split Step: Click "Split Way" button, then click on GREEN nodes to split the way. When finished splitting, click "Complete" to proceed to tagging.');
        } else if (step === 'tag') {
            // Ensure we're in tag workflow step
            this.workflowStep = 'tag';
            this.updateWorkflowUI();
            
            // Disable edit mode if active (to ensure ways are clickable)
            if (this.previewEditMode) {
                this.toggleEditMode();
            }
            
            // Disable split mode if active (to ensure ways are clickable)
            if (this.splitMode) {
                this.toggleSplitMode();
            }
            
            // Ensure all ways are clickable - reattach click handlers if needed
            this.editableLayers.forEach(layer => {
                if ((layer instanceof L.Polyline || layer instanceof L.Polygon) && layer._isGpsTrace) {
                    // Remove existing click handlers
                    layer.off('click');
                    // Add click handler that works in tag step
                    layer.on('click', (e) => {
                        if (this.workflowStep === 'tag' && !e.originalEvent.target.closest('.vertex-marker')) {
                            const addToSelection = this.multiSelectMode && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);
                            this.selectWay(layer, addToSelection);
                            e.originalEvent.stopPropagation();
                        }
                    });
                }
            });
            
            // Show tag editor panel with all tag inputs
            const tagEditorPanel = document.getElementById('tagEditorPanel');
            if (tagEditorPanel) {
                tagEditorPanel.style.display = 'block';
                // Show tag input rows (highway and oneway) - step 4 features
                const tagRows = tagEditorPanel.querySelectorAll('.tag-row');
                tagRows.forEach(row => {
                    row.style.display = ''; // Show all tag rows
                });
                // Show the selected way info header
                const selectedWayInfo = tagEditorPanel.querySelector('#selectedWayInfo');
                if (selectedWayInfo) selectedWayInfo.style.display = '';
                const tagEditorHeader = tagEditorPanel.querySelector('.tag-editor-header h4');
                if (tagEditorHeader) tagEditorHeader.textContent = '🏷️ Way Tags';
            }
            
            // Hide split button (step 3 feature)
            const splitBtn = document.getElementById('splitWayBtn');
            const splitBtnMain = document.getElementById('splitWayBtnMain');
            if (splitBtn) splitBtn.style.display = 'none';
            if (splitBtnMain) splitBtnMain.style.display = 'none';
            
            // Hide edit mode buttons (step 2 features)
            document.getElementById('simplifyBtn').style.display = 'none';
            document.getElementById('toleranceInput').style.display = 'none';
            document.getElementById('undoBtn').style.display = 'none';
            document.getElementById('redoBtn').style.display = 'none';
            document.getElementById('toggleEditModeBtn').style.display = 'none';
            
            // Disable edit mode if active
            if (this.previewEditMode) {
                this.toggleEditMode();
            }
            // Disable split mode if active
            if (this.splitMode) {
                this.toggleSplitMode();
            }
            alert('🏷️ Tag Step: Click on ways to select them, then set highway type and oneway direction. Tag all ways, then click "Complete" button in the workflow panel.');
        }
    }

    completeWorkflowStep(step) {
        this.workflowCompleted[step] = true;
        
        // Update UI first to show completed state
        this.updateWorkflowUI();
        
        // Auto-advance to next step
        const stepOrder = ['preview', 'edit', 'split', 'tag'];
        const currentIndex = stepOrder.indexOf(step);
        if (currentIndex < stepOrder.length - 1) {
            const nextStep = stepOrder[currentIndex + 1];
            this.workflowStep = nextStep;
            // Auto-start next step first (this does step-specific setup)
            this.startWorkflowStep(nextStep);
            // Then update UI to ensure button shows up properly
            // Use setTimeout to ensure DOM updates are complete
            setTimeout(() => {
                this.updateWorkflowUI();
            }, 0);
        } else {
            // All steps completed
            this.workflowStep = 'tag';
            this.updateWorkflowUI();
            alert('✅ All workflow steps completed! You can now export to JOSM.');
        }
    }

}

// Initialize task manager when page loads
let taskManager;
document.addEventListener('DOMContentLoaded', () => {
    taskManager = new TaskManager();
});

