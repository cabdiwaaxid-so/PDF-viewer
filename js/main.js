// Mobile-optimized PDF Viewer with full offline support
class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.scale = 1.5;
        this.scaleStep = 0.2;
        this.minScale = 0.5;
        this.maxScale = 5;
        this.rotation = 0;
        this.currentFile = null;
        
        // DOM Elements
        this.canvas = document.getElementById('renderer');
        this.ctx = this.canvas.getContext('2d');
        this.fileInput = document.getElementById('file');
        this.emptyDiv = document.getElementById('empty');
        this.loadingDiv = document.getElementById('loading');
        this.pageInfo = document.getElementById('pageInfo');
        this.pdfControls = document.getElementById('pdfControls');
        this.mobileMenu = document.getElementById('mobileMenu');
        this.mobileControls = document.getElementById('mobileControls');
        
        // Navigation buttons
        this.prevBtn = document.getElementById('prev');
        this.nextBtn = document.getElementById('next');
        this.zoomInBtn = document.getElementById('zoomIn');
        this.zoomOutBtn = document.getElementById('zoomOut');
        this.historyBtn = document.getElementById('history');
        this.mobileHistoryBtn = document.getElementById('mobileHistory');
        this.quickMenuBtn = document.getElementById('quickMenu');
        
        // Database
        this.db = null;
        this.dbName = 'PDFViewerDB';
        this.dbVersion = 3;
        
        // Initialize
        this.init();
    }
    
    async init() {
        // Initialize UI
        this.setupEventListeners();
        
        // Initialize database
        await this.initDB();
        
        // Check for saved PDFs
        await this.checkForSavedPDFs();
        
        // Load last viewed PDF if exists
        await this.loadLastViewedPDF();
        
        // Register service worker
        this.registerServiceWorker();
        
        // Update UI for mobile
        this.updateMobileUI();
        
        // Add orientation change handler
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.onResize(), 300);
        });
        
        window.addEventListener('resize', () => this.onResize());
    }
    
    setupEventListeners() {
        // File input
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Navigation buttons
        this.prevBtn.addEventListener('click', () => this.onPrevPage());
        this.nextBtn.addEventListener('click', () => this.onNextPage());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        
        // History buttons
        this.historyBtn.addEventListener('click', () => this.showHistory());
        this.mobileHistoryBtn.addEventListener('click', () => this.showHistory());
        
        // Mobile menu
        this.mobileMenu.addEventListener('click', () => this.toggleMobileMenu());
        this.quickMenuBtn.addEventListener('click', () => this.showQuickMenu());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Touch gestures for mobile
        this.setupTouchGestures();
        
        // Click on canvas for navigation
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    }
    
    setupTouchGestures() {
        let startX, startY, startDistance;
        let isPinching = false;
        let lastTouchTime = 0;
        
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                lastTouchTime = Date.now();
            } else if (e.touches.length === 2) {
                isPinching = true;
                startDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
                e.preventDefault();
            }
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (e) => {
            if (!this.pdfDoc || isPinching) {
                e.preventDefault();
                return;
            }
            
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                const deltaX = touch.clientX - startX;
                const deltaY = touch.clientY - startY;
                
                // Only prevent default if horizontal swipe is significant
                if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
                    e.preventDefault();
                }
            } else if (e.touches.length === 2) {
                e.preventDefault();
                const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
                const scaleChange = currentDistance / startDistance;
                
                if (Math.abs(scaleChange - 1) > 0.05) {
                    this.scale *= scaleChange;
                    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale));
                    startDistance = currentDistance;
                    this.renderPage(this.pageNum);
                }
            }
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (e) => {
            if (isPinching) {
                isPinching = false;
                return;
            }
            
            if (e.changedTouches.length === 1 && Date.now() - lastTouchTime < 300) {
                const touch = e.changedTouches[0];
                const deltaX = touch.clientX - startX;
                
                if (Math.abs(deltaX) > 50) {
                    if (deltaX > 0) {
                        this.onPrevPage(); // Swipe right
                    } else {
                        this.onNextPage(); // Swipe left
                    }
                }
            }
        });
        
        // Double tap to zoom
        this.canvas.addEventListener('touchend', (e) => {
            const currentTime = Date.now();
            if (currentTime - lastTouchTime < 300) {
                // Double tap
                this.handleDoubleTap(e);
            }
            lastTouchTime = currentTime;
        });
    }
    
    getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    handleDoubleTap(e) {
        const touch = e.changedTouches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        
        if (x < this.canvas.width / 2) {
            this.onPrevPage();
        } else {
            this.onNextPage();
        }
    }
    
    handleCanvasClick(e) {
        if (!this.pdfDoc) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        if (x < this.canvas.width / 3) {
            this.onPrevPage();
        } else if (x > this.canvas.width * 2/3) {
            this.onNextPage();
        } else {
            // Center click - zoom toggle
            this.scale = this.scale === 1.5 ? 2.5 : 1.5;
            this.renderPage(this.pageNum);
        }
    }
    
    handleKeyDown(e) {
        if (!this.pdfDoc) return;
        
        switch(e.key) {
            case 'ArrowLeft':
            case 'PageUp':
                e.preventDefault();
                this.onPrevPage();
                break;
            case 'ArrowRight':
            case 'PageDown':
                e.preventDefault();
                this.onNextPage();
                break;
            case '+':
            case '=':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.zoomIn();
                }
                break;
            case '-':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.zoomOut();
                }
                break;
            case 'r':
            case 'R':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.rotatePage();
                }
                break;
            case '0':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.resetZoom();
                }
                break;
        }
    }
    
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            this.showToast('Please select a valid PDF file', 'error');
            return;
        }
        
        this.currentFile = file;
        await this.loadPDF(file);
        await this.savePDFToDB(file);
        await this.addToHistory(file.name, this.pdfDoc.numPages);
        this.updateMobileUI();
    }
    
    async loadPDF(file) {
        try {
            this.showLoading(true);
            
            const arrayBuffer = await file.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);
            
            // Load PDF document
            const loadingTask = pdfjsLib.getDocument(typedArray);
            this.pdfDoc = await loadingTask.promise;
            
            // Update UI
            this.emptyDiv.style.display = 'none';
            this.canvas.style.display = 'block';
            this.pdfControls.style.display = 'block';
            
            // Render first page
            await this.renderPage(1);
            
            // Save to localStorage as last viewed
            this.saveLastViewedPDF(file.name, arrayBuffer);
            
            this.showToast(`Loaded: ${file.name}`, 'success');
            
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showToast('Failed to load PDF file', 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    async loadPDFFromDB(pdfId) {
        try {
            const pdf = await this.getPDFFromDB(pdfId);
            if (!pdf) {
                this.showToast('PDF not found in storage', 'error');
                return;
            }
            
            this.currentFile = { name: pdf.name };
            const typedArray = new Uint8Array(pdf.data);
            
            const loadingTask = pdfjsLib.getDocument(typedArray);
            this.pdfDoc = await loadingTask.promise;
            
            this.emptyDiv.style.display = 'none';
            this.canvas.style.display = 'block';
            this.pdfControls.style.display = 'block';
            
            await this.renderPage(1);
            await this.addToHistory(pdf.name, this.pdfDoc.numPages);
            
            this.showToast(`Loaded: ${pdf.name}`, 'success');
            
        } catch (error) {
            console.error('Error loading PDF from DB:', error);
            this.showToast('Failed to load PDF from storage', 'error');
        }
    }
    
    async renderPage(num) {
        if (!this.pdfDoc || this.pageRendering) return;
        
        this.pageRendering = true;
        
        try {
            const page = await this.pdfDoc.getPage(num);
            const viewport = page.getViewport({
                scale: this.scale,
                rotation: this.rotation
            });
            
            // Adjust canvas size
            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;
            this.canvas.style.maxHeight = '80vh';
            this.canvas.style.maxWidth = '100%';
            
            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            this.pageNum = num;
            this.updatePageInfo();
            
            if (this.pageNumPending !== null) {
                const nextPage = this.pageNumPending;
                this.pageNumPending = null;
                await this.renderPage(nextPage);
            }
            
        } catch (error) {
            console.error('Error rendering page:', error);
            this.showToast('Error displaying page', 'error');
        } finally {
            this.pageRendering = false;
        }
    }
    
    updatePageInfo() {
        if (!this.pdfDoc) return;
        
        const totalPages = this.pdfDoc.numPages;
        const zoomPercent = Math.round(this.scale * 100);
        
        this.pageInfo.textContent = `${this.pageNum}/${totalPages} (${zoomPercent}%)`;
        document.title = `${this.currentFile?.name || 'PDF'} - Page ${this.pageNum}/${totalPages}`;
    }
    
    onPrevPage() {
        if (this.pageNum <= 1 || !this.pdfDoc) return;
        this.pageNum--;
        this.queueRenderPage(this.pageNum);
    }
    
    onNextPage() {
        if (!this.pdfDoc || this.pageNum >= this.pdfDoc.numPages) return;
        this.pageNum++;
        this.queueRenderPage(this.pageNum);
    }
    
    queueRenderPage(num) {
        if (this.pageRendering) {
            this.pageNumPending = num;
        } else {
            this.renderPage(num);
        }
    }
    
    zoomIn() {
        this.scale = Math.min(this.maxScale, this.scale + this.scaleStep);
        this.renderPage(this.pageNum);
        this.showToast(`Zoom: ${Math.round(this.scale * 100)}%`, 'info');
    }
    
    zoomOut() {
        this.scale = Math.max(this.minScale, this.scale - this.scaleStep);
        this.renderPage(this.pageNum);
        this.showToast(`Zoom: ${Math.round(this.scale * 100)}%`, 'info');
    }
    
    resetZoom() {
        this.scale = 1.5;
        this.renderPage(this.pageNum);
        this.showToast('Zoom reset', 'info');
    }
    
    rotatePage() {
        this.rotation = (this.rotation + 90) % 360;
        this.renderPage(this.pageNum);
        this.showToast(`Rotated: ${this.rotation}°`, 'info');
    }
    
    onResize() {
        if (this.pdfDoc) {
            // Re-render current page with possibly adjusted scale
            setTimeout(() => this.renderPage(this.pageNum), 100);
        }
    }
    
    // Database Methods
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };
            
            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                
                // Create object stores if they don't exist
                if (!this.db.objectStoreNames.contains('pdfs')) {
                    const pdfStore = this.db.createObjectStore('pdfs', { keyPath: 'id', autoIncrement: true });
                    pdfStore.createIndex('name', 'name', { unique: false });
                    pdfStore.createIndex('date', 'date', { unique: false });
                }
                
                if (!this.db.objectStoreNames.contains('history')) {
                    const historyStore = this.db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
                    historyStore.createIndex('pdfName', 'pdfName', { unique: false });
                    historyStore.createIndex('date', 'date', { unique: false });
                }
                
                if (!this.db.objectStoreNames.contains('settings')) {
                    const settingsStore = this.db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('Database initialized');
                resolve();
            };
        });
    }
    
    async savePDFToDB(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                const pdfData = {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: event.target.result,
                    date: new Date().toISOString(),
                    lastViewed: new Date().toISOString()
                };
                
                try {
                    const tx = this.db.transaction(['pdfs'], 'readwrite');
                    const store = tx.objectStore('pdfs');
                    const request = store.add(pdfData);
                    
                    request.onsuccess = () => {
                        console.log('PDF saved to database:', file.name);
                        resolve(request.result);
                    };
                    
                    request.onerror = (e) => {
                        console.error('Error saving PDF:', e.target.error);
                        reject(e.target.error);
                    };
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = (error) => {
                reject(error);
            };
            
            reader.readAsArrayBuffer(file);
        });
    }
    
    async getPDFFromDB(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['pdfs'], 'readonly');
            const store = tx.objectStore('pdfs');
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }
    
    async getAllPDFs() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['pdfs'], 'readonly');
            const store = tx.objectStore('pdfs');
            const index = store.index('date');
            const request = index.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }
    
    async addToHistory(pdfName, pageCount) {
        return new Promise((resolve, reject) => {
            const historyEntry = {
                pdfName: pdfName,
                pageCount: pageCount,
                viewedPage: this.pageNum,
                date: new Date().toISOString()
            };
            
            const tx = this.db.transaction(['history'], 'readwrite');
            const store = tx.objectStore('history');
            const request = store.add(historyEntry);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }
    
    async getHistory() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['history'], 'readonly');
            const store = tx.objectStore('history');
            const index = store.index('date');
            const request = index.openCursor(null, 'prev');
            const historyItems = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    historyItems.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(historyItems);
                }
            };
            
            request.onerror = (e) => reject(e.target.error);
        });
    }
    
    async clearHistory() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['history'], 'readwrite');
            const store = tx.objectStore('history');
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }
    
    // UI Methods
    async showHistory() {
        try {
            const history = await this.getHistory();
            const savedPDFs = await this.getAllPDFs();
            
            this.showModal('History & Saved PDFs', `
                <div class="space-y-4">
                    <div>
                        <h3 class="text-lg font-semibold text-green-300 mb-2">Saved PDFs (${savedPDFs.length})</h3>
                        <div class="max-h-60 overflow-y-auto space-y-2">
                            ${savedPDFs.length > 0 ? 
                                savedPDFs.map((pdf, i) => `
                                    <div class="p-3 bg-green-800/50 rounded-lg flex justify-between items-center">
                                        <div>
                                            <div class="text-green-200 font-medium">${pdf.name}</div>
                                            <div class="text-green-400 text-sm">${this.formatFileSize(pdf.size)} • ${new Date(pdf.date).toLocaleDateString()}</div>
                                        </div>
                                        <button onclick="viewer.loadPDFFromDB(${pdf.id})" class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm">
                                            Open
                                        </button>
                                    </div>
                                `).join('') :
                                '<div class="text-center text-green-400 py-4">No saved PDFs</div>'
                            }
                        </div>
                    </div>
                    
                    <div>
                        <h3 class="text-lg font-semibold text-green-300 mb-2">Recent History</h3>
                        <div class="max-h-60 overflow-y-auto space-y-2">
                            ${history.length > 0 ? 
                                history.slice(0, 10).map(item => `
                                    <div class="p-3 bg-green-800/30 rounded-lg">
                                        <div class="text-green-200">${item.pdfName}</div>
                                        <div class="text-green-400 text-sm">
                                            Page ${item.viewedPage} • ${new Date(item.date).toLocaleString()}
                                        </div>
                                    </div>
                                `).join('') :
                                '<div class="text-center text-green-400 py-4">No history available</div>'
                            }
                        </div>
                    </div>
                    
                    ${history.length > 0 ? `
                        <div class="pt-4 border-t border-green-800">
                            <button onclick="viewer.clearHistory()" class="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded-lg">
                                Clear History
                            </button>
                        </div>
                    ` : ''}
                </div>
            `);
            
        } catch (error) {
            console.error('Error loading history:', error);
            this.showToast('Failed to load history', 'error');
        }
    }
    
    async showQuickMenu() {
        this.showModal('Quick Actions', `
            <div class="space-y-3">
                <button onclick="viewer.rotatePage()" class="w-full px-4 py-3 bg-green-700 hover:bg-green-800 rounded-lg flex items-center justify-center space-x-2">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
                    </svg>
                    <span>Rotate Page</span>
                </button>
                
                <button onclick="viewer.resetZoom()" class="w-full px-4 py-3 bg-green-700 hover:bg-green-800 rounded-lg flex items-center justify-center space-x-2">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd"></path>
                    </svg>
                    <span>Reset Zoom</span>
                </button>
                
                <button onclick="document.getElementById('file').click()" class="w-full px-4 py-3 bg-green-700 hover:bg-green-800 rounded-lg flex items-center justify-center space-x-2">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z"></path>
                        <path d="M9 13h2v5a1 1 0 11-2 0v-5z"></path>
                    </svg>
                    <span>Open New PDF</span>
                </button>
                
                <div class="pt-3 border-t border-green-800">
                    <div class="text-sm text-green-400">Current PDF: ${this.currentFile?.name || 'None'}</div>
                    <div class="text-sm text-green-400 mt-1">Storage: ${await this.getStorageUsage()}</div>
                </div>
            </div>
        `);
    }
    
    showModal(title, content) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) {
            document.body.removeChild(existingModal);
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-green-900 rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div class="p-4 border-b border-green-800 flex justify-between items-center">
                    <h3 class="text-xl font-semibold text-green-300">${title}</h3>
                    <button onclick="this.closest('.modal-overlay').remove()" class="p-2 text-green-400 hover:text-green-300">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div class="p-4 overflow-y-auto flex-grow">
                    ${content}
                </div>
                <div class="p-4 border-t border-green-800">
                    <button onclick="this.closest('.modal-overlay').remove()" class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
    
    showToast(message, type = 'info') {
        // Remove existing toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            info: 'bg-blue-600',
            warning: 'bg-yellow-600'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast fixed bottom-20 left-1/2 transform -translate-x-1/2 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-slide-up`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('animate-fade-out');
                setTimeout(() => toast.remove(), 300);
            }
        }, 3000);
    }
    
    showLoading(show) {
        this.loadingDiv.style.display = show ? 'flex' : 'none';
    }
    
    toggleMobileMenu() {
        this.mobileControls.style.display = this.mobileControls.style.display === 'block' ? 'none' : 'block';
    }
    
    updateMobileUI() {
        const isMobile = window.innerWidth < 768;
        
        if (isMobile) {
            // Add safe area padding
            document.body.classList.add('pb-20');
        } else {
            document.body.classList.remove('pb-20');
        }
        
        // Update canvas max height for mobile
        if (this.canvas && this.pdfDoc) {
            this.canvas.style.maxHeight = isMobile ? '70vh' : '80vh';
        }
    }
    
    // Utility Methods
    async checkForSavedPDFs() {
        try {
            const pdfs = await this.getAllPDFs();
            if (pdfs.length > 0) {
                console.log(`Found ${pdfs.length} saved PDF(s)`);
            }
        } catch (error) {
            console.error('Error checking saved PDFs:', error);
        }
    }
    
    async loadLastViewedPDF() {
        try {
            const lastPDF = localStorage.getItem('lastPDF');
            if (lastPDF) {
                const { name, data } = JSON.parse(lastPDF);
                const typedArray = new Uint8Array(data);
                
                const loadingTask = pdfjsLib.getDocument(typedArray);
                this.pdfDoc = await loadingTask.promise;
                
                this.currentFile = { name };
                this.emptyDiv.style.display = 'none';
                this.canvas.style.display = 'block';
                this.pdfControls.style.display = 'block';
                
                await this.renderPage(1);
                
                this.showToast(`Resumed: ${name}`, 'info');
            }
        } catch (error) {
            console.error('Error loading last PDF:', error);
            localStorage.removeItem('lastPDF');
        }
    }
    
    saveLastViewedPDF(name, data) {
        try {
            const lastPDF = {
                name,
                data: Array.from(new Uint8Array(data))
            };
            localStorage.setItem('lastPDF', JSON.stringify(lastPDF));
        } catch (error) {
            console.error('Error saving last PDF:', error);
        }
    }
    
    async getStorageUsage() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return 'Storage API not available';
        }
        
        try {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage / (1024 * 1024)).toFixed(2);
            const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(2);
            const percentage = ((estimate.usage / estimate.quota) * 100).toFixed(1);
            
            return `${usedMB} MB / ${quotaMB} MB (${percentage}%)`;
        } catch (error) {
            return 'Unknown';
        }
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./service-worker.js')
                    .then(registration => {
                        console.log('ServiceWorker registered:', registration);
                    })
                    .catch(error => {
                        console.log('ServiceWorker registration failed:', error);
                    });
            });
        }
    }
}

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.viewer = new PDFViewer();
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slide-up {
        from {
            opacity: 0;
            transform: translate(-50%, 20px);
        }
        to {
            opacity: 1;
            transform: translate(-50%, 0);
        }
    }
    
    @keyframes fade-out {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }
    
    .animate-slide-up {
        animation: slide-up 0.3s ease-out;
    }
    
    .animate-fade-out {
        animation: fade-out 0.3s ease-out;
    }
`;
document.head.appendChild(style);