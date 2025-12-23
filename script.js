// Dynasty Baseball Draft Tracker
// Simple, stable, and fast draft management system

class DraftTracker {
    constructor() {
        this.players = [];
        this.currentView = 'all';
        this.currentOwner = '';
        this.searchTerm = '';
        this.sortField = null;
        this.sortDirection = 'asc';
        this.currentEditingPlayer = null;
        this.supabase = null;
        this.editMode = false;
        this.expandedNotes = new Set();
        
        this.init();
    }

    init() {
        this.initializeSupabase();
        this.loadFromStorage();
        this.bindEvents();
        this.updateOwnerSelect();
        this.render();
        console.log('DraftTracker initialized');
    }

    // Supabase integration
    initializeSupabase() {
        try {
            if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey) {
                this.supabase = window.supabase.createClient(
                    window.SUPABASE_CONFIG.url,
                    window.SUPABASE_CONFIG.anonKey
                );
                console.log('Supabase client initialized successfully');
            } else {
                console.warn('Supabase configuration not found. Sync features will be disabled.');
                this.disableSyncButtons();
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
            this.disableSyncButtons();
        }
    }

    disableSyncButtons() {
        const loadBtn = document.getElementById('loadFromSupabaseBtn');
        const backupBtn = document.getElementById('backupToSupabaseBtn');
        if (loadBtn) loadBtn.disabled = true;
        if (backupBtn) backupBtn.disabled = true;
    }

    setSyncStatus(message, type = '') {
        const statusElement = document.getElementById('syncStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = 'sync-status';
            if (type) {
                statusElement.classList.add(type);
            }
            
            // Clear status after 3 seconds for success/error messages
            if (type === 'success' || type === 'error') {
                setTimeout(() => {
                    statusElement.textContent = '';
                    statusElement.className = 'sync-status';
                }, 3000);
            }
        }
    }

    async loadFromSupabase() {
        if (!this.supabase) {
            this.setSyncStatus('Supabase not configured', 'error');
            return;
        }

        try {
            this.setSyncStatus('Loading...', 'loading');

            const { data, error } = await this.supabase
                .from('players')
                .select('*')
                .order('name');

            if (error) {
                throw error;
            }

            if (data && data.length > 0) {
                // Convert Supabase data to our format
                const supabasePlayers = data.map(player => ({
                    id: player.id.toString(),
                    name: player.name || '',
                    position: player.position || '',
                    mlbTeam: player.team || '',
                    notes: player.notes || '',
                    fantasyOwner: player.owner_id || '',
                    drafted: player.drafted || false,
                    draftNotes: player.draft_notes || '',
                    addedDate: player.created_at || new Date().toISOString()
                }));

                // Merge with existing local data, preserving local draft info
                this.mergeSupabaseData(supabasePlayers);
                
                this.setSyncStatus(`Loaded ${data.length} players from Supabase`, 'success');
            } else {
                this.setSyncStatus('No players found in Supabase', 'error');
            }
        } catch (error) {
            console.error('Error loading from Supabase:', error);
            this.setSyncStatus('Error loading from Supabase', 'error');
        }
    }

    mergeSupabaseData(supabasePlayers) {
        // Create a map of existing players by name for quick lookup
        const existingPlayerMap = new Map();
        this.players.forEach(player => {
            existingPlayerMap.set(player.name.toLowerCase(), player);
        });

        // Merge data
        supabasePlayers.forEach(supabasePlayer => {
            const existingPlayer = existingPlayerMap.get(supabasePlayer.name.toLowerCase());
            
            if (existingPlayer) {
                // Update non-draft fields from Supabase, preserve draft info
                existingPlayer.position = supabasePlayer.position;
                existingPlayer.mlbTeam = supabasePlayer.mlbTeam;
                existingPlayer.notes = supabasePlayer.notes;
            } else {
                // Add new player from Supabase
                this.players.push(supabasePlayer);
            }
        });

        this.saveToStorage();
        this.render();
    }

    async backupToSupabase() {
        if (!this.supabase) {
            this.setSyncStatus('Supabase not configured', 'error');
            return;
        }

        try {
            this.setSyncStatus('Backing up...', 'loading');

            // Convert our data format to Supabase format
            const supabaseData = this.players.map(player => ({
                id: parseInt(player.id) || Date.now(),
                name: player.name,
                position: player.position || null,
                team: player.mlbTeam || null,
                notes: player.notes || null,
                owner_id: player.fantasyOwner || null,
                drafted: player.drafted || false,
                draft_notes: player.draftNotes || null,
                updated_at: new Date().toISOString()
            }));

            // Use upsert to update existing records and insert new ones
            const { data, error } = await this.supabase
                .from('players')
                .upsert(supabaseData, { onConflict: 'id' })
                .select();

            if (error) {
                throw error;
            }

            this.setSyncStatus(`Backed up ${this.players.length} players to Supabase`, 'success');
        } catch (error) {
            console.error('Error backing up to Supabase:', error);
            this.setSyncStatus('Error backing up to Supabase', 'error');
        }
    }

    // Data persistence
    loadFromStorage() {
        const stored = localStorage.getItem('baseballDraftTracker');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.players = data.players || [];
            } catch (e) {
                console.error('Error loading data:', e);
                this.players = [];
            }
        }
    }

    saveToStorage() {
        const data = {
            players: this.players,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem('baseballDraftTracker', JSON.stringify(data));
    }

    // Player management
    addPlayer(playerData) {
        const player = {
            id: Date.now().toString(),
            name: playerData.name.trim(),
            position: playerData.position?.trim() || '',
            mlbTeam: playerData.mlbTeam?.trim() || '',
            notes: playerData.notes?.trim() || '',
            fantasyOwner: '',
            drafted: false,
            draftNotes: '',
            addedDate: new Date().toISOString()
        };
        
        this.players.push(player);
        this.saveToStorage();
        this.render();
        return player;
    }

    updatePlayer(playerId, updates) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
            this.players[playerIndex] = { ...this.players[playerIndex], ...updates };
            this.saveToStorage();
            this.render();
        }
    }

    deletePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.saveToStorage();
        this.render();
    }

    draftPlayer(playerId, ownerData) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.drafted = true;
            player.fantasyOwner = ownerData.owner.trim();
            player.draftNotes = ownerData.notes?.trim() || '';
            player.draftedDate = new Date().toISOString();
            this.saveToStorage();
            this.render();
        }
    }

    undraftPlayer(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.drafted = false;
            player.fantasyOwner = '';
            player.draftNotes = '';
            delete player.draftedDate;
            this.saveToStorage();
            this.render();
        }
    }

    // View and filtering
    getFilteredPlayers() {
        let filtered = [...this.players];

        // Apply view filter
        switch (this.currentView) {
            case 'available':
                filtered = filtered.filter(p => !p.drafted);
                break;
            case 'drafted':
                filtered = filtered.filter(p => p.drafted);
                break;
            case 'by-owner':
                if (this.currentOwner) {
                    filtered = filtered.filter(p => p.fantasyOwner === this.currentOwner);
                } else {
                    filtered = filtered.filter(p => p.drafted);
                }
                break;
        }

        // Apply search filter
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(term) ||
                p.position.toLowerCase().includes(term) ||
                p.mlbTeam.toLowerCase().includes(term) ||
                p.notes.toLowerCase().includes(term) ||
                p.fantasyOwner.toLowerCase().includes(term)
            );
        }

        // Apply sorting
        if (this.sortField) {
            filtered.sort((a, b) => {
                let aVal = a[this.sortField] || '';
                let bVal = b[this.sortField] || '';
                
                // Case-insensitive string comparison
                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                
                if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    }

    getUniqueOwners() {
        const owners = new Set();
        this.players.forEach(p => {
            if (p.fantasyOwner) {
                owners.add(p.fantasyOwner);
            }
        });
        return Array.from(owners).sort();
    }

    // Rendering
    render() {
        const filteredPlayers = this.getFilteredPlayers();
        const tbody = document.getElementById('playersTableBody');
        const emptyState = document.getElementById('emptyState');

        if (this.currentView === 'by-owner') {
            this.renderOwnerRosters();
        } else {
            this.renderTable(filteredPlayers);
        }

        // Show/hide empty state
        if (filteredPlayers.length === 0 && this.currentView !== 'by-owner') {
            tbody.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            tbody.style.display = '';
            emptyState.style.display = 'none';
        }
    }

    renderTable(players) {
        const tbody = document.getElementById('playersTableBody');
        tbody.innerHTML = '';

        players.forEach(player => {
            const row = document.createElement('tr');
            if (player.drafted) {
                row.classList.add('drafted');
            }

            const nameClass = this.editMode ? 'editable' : '';
            const positionClass = this.editMode ? 'editable' : '';
            const mlbTeamClass = this.editMode ? 'editable' : '';
            const notesClass = this.editMode ? 'editable' : '';
            const isExpanded = this.expandedNotes.has(player.id);
            
            row.innerHTML = `
                <td>
                    <div class="player-name ${nameClass}" data-field="name" data-id="${player.id}">
                        ${this.escapeHtml(player.name)}
                        ${this.getExternalLinks(player)}
                    </div>
                </td>
                <td>
                    <span class="position-badge ${positionClass}" data-field="position" data-id="${player.id}">${this.escapeHtml(player.position || '')}</span>
                </td>
                <td>
                    <div class="mlb-team ${mlbTeamClass}" data-field="mlbTeam" data-id="${player.id}">${this.escapeHtml(player.mlbTeam || '')}</div>
                </td>
                <td>
                    ${player.drafted ? 
                        `<span class="fantasy-owner editable" data-field="fantasyOwner" data-id="${player.id}">${this.getTeamDisplay(player.fantasyOwner)}</span>` : 
                        '<span class="draft-status available">Available</span>'
                    }
                </td>
                <td>
                    <div class="notes ${notesClass}" data-field="notes" data-id="${player.id}" title="${this.escapeHtml(player.notes || '')}">
                        ${this.escapeHtml(player.notes || '')}
                        ${!isExpanded ? '<span class="expand-icon">▼</span>' : '<span class="expand-icon">▲</span>'}
                        ${this.escapeHtml(player.notes || '')}
                    </div>
                </td>
                <td>
                    <div class="actions">
                        ${!player.drafted ? 
                            `<button class="btn btn-success btn-sm draft-btn" data-id="${player.id}">Draft</button>` :
                            `<button class="btn btn-warning btn-sm undraft-btn" data-id="${player.id}">Undraft</button>`
                        }
                        <button class="btn btn-danger btn-sm delete-btn" data-id="${player.id}">Delete</button>
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        });

        this.bindRowEvents();
    }

    renderOwnerRosters() {
        const container = document.querySelector('.table-container');
        const owners = this.getUniqueOwners();

        if (owners.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No drafted players found.</p></div>';
            return;
        }

        let html = '';
        owners.forEach(owner => {
            const ownerPlayers = this.players.filter(p => p.fantasyOwner === owner);
            
            html += `
                <div class="owner-roster">
                    <div class="owner-header">
                        ${this.escapeHtml(owner)} (${ownerPlayers.length} players)
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Position</th>
                                <th>MLB Team</th>
                                <th>Notes</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            ownerPlayers.forEach(player => {
                html += `
                    <tr>
                        <td><div class="player-name">${this.escapeHtml(player.name)}</div></td>
                        <td><span class="position-badge">${this.escapeHtml(player.position || '')}</span></td>
                        <td><div class="mlb-team">${this.escapeHtml(player.mlbTeam || '')}</div></td>
                        <td><div class="notes" title="${this.escapeHtml(player.notes || '')}">${this.escapeHtml(player.notes || '')}</div></td>
                        <td>
                            <div class="actions">
                                <button class="btn btn-warning btn-sm undraft-btn" data-id="${player.id}">Undraft</button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        });

        container.innerHTML = html;
        this.bindRowEvents();
    }

    // Event handling
    bindEvents() {
        // Add player button
        document.getElementById('addPlayerBtn').addEventListener('click', () => {
            this.showAddPlayerModal();
        });

        // Clear all data
        document.getElementById('clearAllBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
                this.clearAllData();
            }
        });

        // View selection
        document.getElementById('viewSelect').addEventListener('change', (e) => {
            this.currentView = e.target.value;
            const ownerFilter = document.getElementById('ownerFilter');
            
            if (this.currentView === 'by-owner') {
                ownerFilter.style.display = 'flex';
                this.updateOwnerSelect();
            } else {
                ownerFilter.style.display = 'none';
            }
            
            this.render();
        });

        // Owner selection for by-owner view
        document.getElementById('ownerSelect').addEventListener('change', (e) => {
            this.currentOwner = e.target.value;
            this.render();
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.render();
        });

        // Sort buttons
        document.getElementById('sortByName').addEventListener('click', () => {
            this.setSort('name');
        });

        document.getElementById('sortByTeam').addEventListener('click', () => {
            this.setSort('mlbTeam');
        });

        document.getElementById('sortByPosition').addEventListener('click', () => {
            this.setSort('position');
        });

        // Supabase sync buttons
        document.getElementById('loadFromSupabaseBtn').addEventListener('click', () => {
            this.loadFromSupabase();
        });

        document.getElementById('backupToSupabaseBtn').addEventListener('click', () => {
            this.backupToSupabase();
        });

        // Modal forms
        document.getElementById('addPlayerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddPlayer(e);
        });

        document.getElementById('draftPlayerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDraftPlayer(e);
        });

        // Modal close buttons
        document.querySelectorAll('.close, .close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });

        // Click outside modal to close
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeAllModals();
            }
        });

        // Edit mode toggle
        document.getElementById('editModeToggle').addEventListener('change', (e) => {
            this.editMode = e.target.checked;
            this.render();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + N for new player
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.showAddPlayerModal();
            }
            
            // Escape to close modals and close expanded notes
            if (e.key === 'Escape') {
                this.closeAllModals();
                this.closeAllExpandedNotes();
            }
            
            // Ctrl/Cmd + F to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                document.getElementById('searchInput').focus();
            }
        });
    }

    bindRowEvents() {
        // Draft/Undraft buttons
        document.querySelectorAll('.draft-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerId = e.target.dataset.id;
                this.showDraftPlayerModal(playerId);
            });
        });

        document.querySelectorAll('.undraft-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerId = e.target.dataset.id;
                this.undraftPlayer(playerId);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerId = e.target.dataset.id;
                if (confirm('Are you sure you want to delete this player?')) {
                    this.deletePlayer(playerId);
                }
            });
        });

        // Inline editing and note expansion
        document.querySelectorAll('.editable').forEach(elem => {
            elem.addEventListener('click', (e) => {
                e.stopPropagation();
                if (elem.classList.contains('notes')) {
                    this.toggleNoteExpansion(elem.dataset.id, elem);
                } else if (this.editMode) {
                    this.startInlineEdit(e.target);
                }
            });
        });
    }

    // Modal management
    showAddPlayerModal() {
        document.getElementById('addPlayerModal').style.display = 'block';
        document.getElementById('playerName').focus();
    }

    showDraftPlayerModal(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        document.getElementById('draftPlayerName').textContent = `${player.name} (${player.position || 'N/A'}) - ${player.mlbTeam || 'N/A'}`;
        document.getElementById('fantasyOwner').value = '';
        document.getElementById('draftNotes').value = '';
        document.getElementById('draftPlayerForm').dataset.playerId = playerId;
        document.getElementById('draftPlayerModal').style.display = 'block';
        document.getElementById('fantasyOwner').focus();

        // Setup autocomplete for fantasy owner
        this.setupOwnerAutocomplete();
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        this.currentEditingPlayer = null;
    }

    // Form handlers
    handleAddPlayer(e) {
        const formData = new FormData(e.target);
        const playerData = {
            name: formData.get('playerName'),
            position: formData.get('playerPosition'),
            mlbTeam: formData.get('playerMlbTeam'),
            notes: formData.get('playerNotes')
        };

        this.addPlayer(playerData);
        this.closeAllModals();
        e.target.reset();
    }

    handleDraftPlayer(e) {
        const playerId = e.target.dataset.playerId;
        const ownerData = {
            owner: document.getElementById('fantasyOwner').value,
            notes: document.getElementById('draftNotes').value
        };

        this.draftPlayer(playerId, ownerData);
        this.closeAllModals();
    }

    // Inline editing
    startInlineEdit(element) {
        if (this.currentEditingPlayer) return;
        
        const field = element.dataset.field;
        const playerId = element.dataset.id;
        const player = this.players.find(p => p.id === playerId);
        
        if (!player) return;

        const currentValue = player[field] || '';
        const inputType = field === 'notes' ? 'textarea' : 'input';
        const input = document.createElement(inputType);
        input.type = 'text';
        input.value = currentValue;
        input.className = 'editing';
        
        if (field === 'notes') {
            input.rows = 2;
        }

        element.innerHTML = '';
        element.appendChild(input);
        input.focus();
        input.select();

        this.currentEditingPlayer = { playerId, field, element, originalValue: currentValue };

        const saveEdit = () => {
            const newValue = input.value.trim();
            this.updatePlayer(playerId, { [field]: newValue });
            this.currentEditingPlayer = null;
        };

        const cancelEdit = () => {
            this.render();
            this.currentEditingPlayer = null;
        };

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && field !== 'notes') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
    }

    // Utility methods
    setSort(field) {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }
        this.render();
    }

    updateOwnerSelect() {
        const select = document.getElementById('ownerSelect');
        const owners = this.getUniqueOwners();
        
        select.innerHTML = '<option value="">All Owners</option>';
        owners.forEach(owner => {
            const option = document.createElement('option');
            option.value = owner;
            option.textContent = owner;
            select.appendChild(option);
        });
    }

    setupOwnerAutocomplete() {
        const input = document.getElementById('fantasyOwner');
        const owners = this.getUniqueOwners();
        
        // Simple datalist for autocomplete
        let datalist = document.getElementById('ownerDatalist');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'ownerDatalist';
            input.parentNode.appendChild(datalist);
        }
        
        datalist.innerHTML = '';
        owners.forEach(owner => {
            const option = document.createElement('option');
            option.value = owner;
            datalist.appendChild(option);
        });
        
        input.setAttribute('list', 'ownerDatalist');
    }

    clearAllData() {
        this.players = [];
        this.saveToStorage();
        this.render();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // External links functionality
    getExternalLinks(player) {
        return `
            <div class="external-links">
                <span class="external-link fangraphs-link" onclick="window.draftTracker.openFangraphs('${this.escapeHtml(player.name)}')" title="Search on Fangraphs"></span>
                <span class="external-link twitter-link" onclick="window.draftTracker.openTwitter('${this.escapeHtml(player.name)}')" title="Search on Twitter"></span>
            </div>
        `;
    }

    openFangraphs(playerName) {
        // Try to get direct player page URL, fallback to search if not found
        const directUrl = this.getFangraphsPlayerUrl(playerName);
        if (directUrl) {
            window.open(directUrl, '_blank');
        } else {
            // Fallback to search if no direct URL found
            const searchUrl = `https://www.fangraphs.com/search.aspx?search=${encodeURIComponent(playerName)}`;
            window.open(searchUrl, '_blank');
        }
    }

    getFangraphsPlayerUrl(playerName) {
        // Fangraphs player ID mapping - add more players as needed
        // Format: "Player Name": "fangraphs-id"
        const fangraphsPlayerIds = {
            // Example players - you can add more as needed
            "Mike Trout": "10155",
            "Aaron Judge": "19753", 
            "Shohei Ohtani": "19774",
            "Mookie Betts": "16244",
            "Freddie Freeman": "8657",
            "Juan Soto": "19908",
            "Paul Goldschmidt": "13211",
            "Manny Machado": "11631",
            "Nolan Arenado": "13227",
            "Trea Turner": "15987",
            "Corey Seager": "17708",
            "Bryce Harper": "13580",
            "Jacob deGrom": "11943",
            "Gerrit Cole": "13058",
            "Max Scherzer": "5193",
            "Clayton Kershaw": "3363",
            "Stephen Strasburg": "8979",
            "Justin Verlander": "4509",
            "Zack Greinke": "2777",
            "Madison Bumgarner": "9479",
            // Test players for clean Fangraphs implementation
            "AJ Russell": "12747",
            "Andrew Fischer": "20263",
            "Andrew Salasa": "20308"
        };

        const playerId = fangraphsPlayerIds[playerName];
        if (playerId) {
            return `https://www.fangraphs.com/statss.aspx?playerid=${playerId}&position=P`;
        }
        
        // Try to find partial matches (useful for players with similar names)
        for (const [name, id] of Object.entries(fangraphsPlayerIds)) {
            if (name.toLowerCase().includes(playerName.toLowerCase()) || 
                playerName.toLowerCase().includes(name.toLowerCase())) {
                return `https://www.fangraphs.com/statss.aspx?playerid=${id}&position=P`;
            }
        }
        
        return null; // No direct URL found
    }

    openTwitter(playerName) {
        const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(playerName)}&src=typed_query`;
        window.open(searchUrl, '_blank');
    }

    // Team display functionality
    getTeamDisplay(teamName) {
        if (!teamName) return this.escapeHtml(teamName || '');
        
        const teamNameLower = teamName.toLowerCase().trim();
        
        // Team configurations with official colors from encycolorpedia.com
        const teams = {
            'mets': {
                name: 'Mets',
                logo: 'NYM',
                colors: 'linear-gradient(135deg, #FF5910 0%, #002D72 100%)', // Mets Orange and Blue
                textColor: '#FFFFFF'
            },
            'yankees': {
                name: 'Yankees', 
                logo: 'NYY',
                colors: 'linear-gradient(135deg, #0C2340 0%, #C41230 100%)', // Yankees Navy and Red
                textColor: '#FFFFFF'
            },
            'dodgers': {
                name: 'Dodgers',
                logo: 'LAD',
                colors: 'linear-gradient(135deg, #005A9C 0%, #A51931 100%)', // Dodgers Blue and Red
                textColor: '#FFFFFF'
            },
            'red sox': {
                name: 'Red Sox',
                logo: 'BOS',
                colors: 'linear-gradient(135deg, #BD3039 0%, #0C2340 100%)', // Red Sox Red and Navy
                textColor: '#FFFFFF'
            },
            'cubs': {
                name: 'Cubs',
                logo: 'CHC',
                colors: 'linear-gradient(135deg, #0E3386 0%, #CC3433 100%)', // Cubs Blue and Red
                textColor: '#FFFFFF'
            },
            'cardinals': {
                name: 'Cardinals',
                logo: 'STL',
                colors: 'linear-gradient(135deg, #C41E3A 0%, #0C2340 100%)', // Cardinals Red and Navy
                textColor: '#FFFFFF'
            },
            'braves': {
                name: 'Braves',
                logo: 'ATL',
                colors: 'linear-gradient(135deg, #002244 0%, #CE1141 100%)', // Braves Navy and Red
                textColor: '#FFFFFF'
            },
            'giants': {
                name: 'Giants',
                logo: 'SFG',
                colors: 'linear-gradient(135deg, #FD5A1E 0%, #000000 100%)', // Giants Orange and Black
                textColor: '#FFFFFF'
            },
            'phillies': {
                name: 'Phillies',
                logo: 'PHI',
                colors: 'linear-gradient(135deg, #E81828 0%, #002D5F 100%)', // Phillies Red and Navy
                textColor: '#FFFFFF'
            },
            'astros': {
                name: 'Astros',
                logo: 'HOU',
                colors: 'linear-gradient(135deg, #002D5F 0%, #EB6E1F 100%)', // Astros Navy and Orange
                textColor: '#FFFFFF'
            },
            'nationals': {
                name: 'Nationals',
                logo: 'WSH',
                colors: 'linear-gradient(135deg, #AB0003 0%, #000000 100%)', // Nationals Red and Black
                textColor: '#FFFFFF'
            },
            'padres': {
                name: 'Padres',
                logo: 'SDP',
                colors: 'linear-gradient(135deg, #154734 0%, #FFC425 100%)', // Padres Navy and Gold
                textColor: '#FFFFFF'
            },
            'rockies': {
                name: 'Rockies',
                logo: 'COL',
                colors: 'linear-gradient(135deg, #33006F 0%, #C4CED4 100%)', // Rockies Purple and Silver
                textColor: '#FFFFFF'
            },
            'diamondbacks': {
                name: 'Diamondbacks',
                logo: 'ARI',
                colors: 'linear-gradient(135deg, #A71930 0%, #000000 100%)', // D-Backs Sedona Red and Black
                textColor: '#FFFFFF'
            },
            'brewers': {
                name: 'Brewers',
                logo: 'MIL',
                colors: 'linear-gradient(135deg, #0A2351 0%, #FFC52F 100%)', // Brewers Navy and Gold
                textColor: '#FFFFFF'
            },
            'pirates': {
                name: 'Pirates',
                logo: 'PIT',
                colors: 'linear-gradient(135deg, #000000 0%, #FDB827 100%)', // Pirates Black and Gold
                textColor: '#FFFFFF'
            },
            'reds': {
                name: 'Reds',
                logo: 'CIN',
                colors: 'linear-gradient(135deg, #C6011F 0%, #000000 100%)', // Reds Red and Black
                textColor: '#FFFFFF'
            },
            'indians': {
                name: 'Indians',
                logo: 'CLE',
                colors: 'linear-gradient(135deg, #0C2340 0%, #E31937 100%)', // Indians Navy and Red
                textColor: '#FFFFFF'
            },
            'guardians': {
                name: 'Guardians',
                logo: 'CLE',
                colors: 'linear-gradient(135deg, #0C2340 0%, #E31937 100%)', // Guardians Navy and Red
                textColor: '#FFFFFF'
            },
            'tigers': {
                name: 'Tigers',
                logo: 'DET',
                colors: 'linear-gradient(135deg, #0C2340 0%, #FF6600 100%)', // Tigers Navy and Orange
                textColor: '#FFFFFF'
            },
            'royals': {
                name: 'Royals',
                logo: 'KCR',
                colors: 'linear-gradient(135deg, #004687 0%, #C09B5F 100%)', // Royals Royal Blue and Gold
                textColor: '#FFFFFF'
            },
            'twins': {
                name: 'Twins',
                logo: 'MIN',
                colors: 'linear-gradient(135deg, #002B5C 0%, #D31145 100%)', // Twins Navy and Red
                textColor: '#FFFFFF'
            },
            'white sox': {
                name: 'White Sox',
                logo: 'CWS',
                colors: 'linear-gradient(135deg, #000000 0%, #C4CED4 100%)', // White Sox Black and Silver
                textColor: '#FFFFFF'
            },
            'orioles': {
                name: 'Orioles',
                logo: 'BAL',
                colors: 'linear-gradient(135deg, #000000 0%, #FB4F14 100%)', // Orioles Black and Orange
                textColor: '#FFFFFF'
            },
            'rays': {
                name: 'Rays',
                logo: 'TBR',
                colors: 'linear-gradient(135deg, #092C5C 0%, #8FBCE6 100%)', // Rays Navy and Light Blue
                textColor: '#FFFFFF'
            },
            'jays': {
                name: 'Jays',
                logo: 'TOR',
                colors: 'linear-gradient(135deg, #0046AD 0%, #134A8E 100%)', // Jays Blue and Dark Blue
                textColor: '#FFFFFF'
            },
            'mariners': {
                name: 'Mariners',
                logo: 'SEA',
                colors: 'linear-gradient(135deg, #005C5D 0%, #C4CED4 100%)', // Mariners Navy and Silver
                textColor: '#FFFFFF'
            },
            'rangers': {
                name: 'Rangers',
                logo: 'TEX',
                colors: 'linear-gradient(135deg, #003278 0%, #C0111F 100%)', // Rangers Navy and Red
                textColor: '#FFFFFF'
            },
            'angels': {
                name: 'Angels',
                logo: 'LAA',
                colors: 'linear-gradient(135deg, #003263 0%, #BA0021 100%)', // Angels Navy and Red
                textColor: '#FFFFFF'
            },
            'athletics': {
                name: 'Athletics',
                logo: 'OAK',
                colors: 'linear-gradient(135deg, #003831 0%, #EFB21E 100%)', // Athletics Green and Gold
                textColor: '#FFFFFF'
            }
        };

        const team = teams[teamNameLower];
        if (team) {
            return `
                <div class="team-display" style="
                    background: ${team.colors};
                    color: ${team.textColor};
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 12px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                ">
                    <span style="font-size: 14px;">${team.logo}</span>
                    <span>${team.name}</span>
                </div>
            `;
        }
        
        // Fallback to plain text for non-recognized teams
        return this.escapeHtml(teamName);
    }

    // Notes expansion functionality
    toggleNoteExpansion(playerId, element) {
        // Find the note element for this player
        const noteElement = document.querySelector(`.notes[data-id="${playerId}"]`);
        if (!noteElement) return;

        if (this.expandedNotes.has(playerId)) {
            this.expandedNotes.delete(playerId);
            noteElement.classList.remove('expanded');
        } else {
            this.expandedNotes.add(playerId);
            noteElement.classList.add('expanded');
        }
    }

    closeAllExpandedNotes() {
        this.expandedNotes.clear();
        document.querySelectorAll('.notes.expanded').forEach(elem => {
            elem.classList.remove('expanded');
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.draftTracker = new DraftTracker();
});
