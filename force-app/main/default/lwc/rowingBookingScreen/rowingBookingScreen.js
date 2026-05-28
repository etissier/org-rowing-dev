import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAvailableBoats from '@salesforce/apex/RowingSessionController.getAvailableBoats';
import createSession from '@salesforce/apex/RowingSessionController.createSession';
import startSession from '@salesforce/apex/RowingSessionController.startSession';
import endSession from '@salesforce/apex/RowingSessionController.endSession';
import reportIssue from '@salesforce/apex/BoatIssueController.reportIssue';

// NOTE: A getRowers() @AuraEnabled(cacheable=true) method returning List<Rower__c> would be
// needed for real crew lookup. For demo purposes, mock crew data is used below.
// Add to RowingSessionController:
//   @AuraEnabled(cacheable=true)
//   public static List<Rower__c> getRowers() {
//       return [SELECT Id, Name FROM Rower__c ORDER BY Name LIMIT 200];
//   }

const MOCK_ROWERS = [
    { id: 'mock-001', name: 'Alice Martin' },
    { id: 'mock-002', name: 'Bob Dupont' },
    { id: 'mock-003', name: 'Claire Lefebvre' },
    { id: 'mock-004', name: 'David Moreau' },
    { id: 'mock-005', name: 'Emma Bernard' },
    { id: 'mock-006', name: 'François Petit' },
    { id: 'mock-007', name: 'Grace Leroy' },
    { id: 'mock-008', name: 'Hugo Simon' },
];

export default class RowingBookingScreen extends LightningElement {

    // ─── Reactive state ──────────────────────────────────────────────────────

    @track boats = [];
    @track selectedSessionType = 'Morning';
    @track selectedCapacity = null;       // null = All
    @track isLoading = false;

    // Modal state
    @track showModal = false;
    @track selectedBoat = { id: '', name: '', capacity: 0 };
    @track crew = [];                     // [{ id, name }]
    @track crewSearchTerm = '';

    // Active session (in-memory only — resets on page reload)
    // NOTE: To persist across reloads a getActiveSessionForCurrentRower() Apex method
    // returning today's Booked/In Progress session would be needed.
    @track activeSession = null;          // { sessionId, boatId, boatName, sessionType, status }

    // Issue form state
    @track showIssueForm = false;
    @track selectedIssueTypes = [];
    @track issueDescription = '';
    @track issueSeverity = 'Minor';

    // ─── Constants ────────────────────────────────────────────────────────────

    get todayDate() {
        return new Date();
    }

    get todayFormatted() {
        return this.todayDate.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    // Apex expects a Date string in YYYY-MM-DD format
    get todayApexDate() {
        const d = this.todayDate;
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day   = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${month}-${day}`;
    }

    // ─── Session type toggle ──────────────────────────────────────────────────

    get morningVariant() {
        return this.selectedSessionType === 'Morning' ? 'brand' : 'neutral';
    }

    get afternoonVariant() {
        return this.selectedSessionType === 'Afternoon' ? 'brand' : 'neutral';
    }

    handleSessionTypeChange(event) {
        this.selectedSessionType = event.currentTarget.dataset.value;
        this.loadBoats();
    }

    // ─── Capacity filter ─────────────────────────────────────────────────────

    get capacityOptions() {
        const options = [
            { value: null,  label: 'All'  },
            { value: 1,     label: '1'    },
            { value: 2,     label: '2'    },
            { value: 4,     label: '4'    },
            { value: 8,     label: '8'    },
        ];
        return options.map(opt => ({
            ...opt,
            // Coerce both sides to string for comparison when selectedCapacity is a number
            cssClass: String(opt.value) === String(this.selectedCapacity)
                ? 'capacity-btn capacity-btn_active'
                : 'capacity-btn',
        }));
    }

    handleCapacityChange(event) {
        const raw = event.currentTarget.dataset.value;
        // dataset values are always strings; convert back to int or null
        this.selectedCapacity = raw === 'null' || raw === '' ? null : parseInt(raw, 10);
        this.loadBoats();
    }

    // ─── Boat list ────────────────────────────────────────────────────────────

    connectedCallback() {
        this.loadBoats();
    }

    loadBoats() {
        this.isLoading = true;
        getAvailableBoats({
            sessionType: this.selectedSessionType,
            sessionDate: this.todayApexDate,
            capacity: this.selectedCapacity,
        })
            .then(result => {
                this.boats = result || [];
            })
            .catch(error => {
                this.showToast('Error', this.extractError(error), 'error');
                this.boats = [];
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    get hasBoats() {
        return this.boats && this.boats.length > 0;
    }

    // ─── Booking modal ────────────────────────────────────────────────────────

    handleBookClick(event) {
        const { boatId, boatName, boatCapacity } = event.currentTarget.dataset;
        this.selectedBoat = {
            id: boatId,
            name: boatName,
            capacity: parseInt(boatCapacity, 10),
        };
        this.crew = [];
        this.crewSearchTerm = '';
        this.showModal = true;
    }

    handleCloseModal() {
        this.showModal = false;
    }

    handleModalBackdropClick() {
        this.showModal = false;
    }

    // Crew capacity: boat holds N people total; 1 slot taken by booking rower
    get maxCrewSize() {
        return Math.max(0, (this.selectedBoat.capacity || 1) - 1);
    }

    get isCrewFull() {
        return this.crew.length >= this.maxCrewSize;
    }

    get hasCrew() {
        return this.crew.length > 0;
    }

    // ─── Crew search (against mock data; swap for Apex wire when available) ───

    get showCrewSearchResults() {
        return this.crewSearchTerm.length > 0 && this.filteredRowers.length > 0;
    }

    get filteredRowers() {
        if (!this.crewSearchTerm) return [];
        const term = this.crewSearchTerm.toLowerCase();
        const alreadySelectedIds = new Set(this.crew.map(m => m.id));
        return MOCK_ROWERS.filter(r =>
            r.name.toLowerCase().includes(term) && !alreadySelectedIds.has(r.id)
        );
    }

    handleCrewSearch(event) {
        this.crewSearchTerm = event.detail.value;
    }

    handleSelectCrewMember(event) {
        if (this.isCrewFull) return;
        const { rowerId, rowerName } = event.currentTarget.dataset;
        this.crew = [...this.crew, { id: rowerId, name: rowerName }];
        this.crewSearchTerm = '';
    }

    handleRemoveCrewMember(event) {
        const rowerId = event.currentTarget.dataset.rowerId;
        this.crew = this.crew.filter(m => m.id !== rowerId);
    }

    // ─── Confirm booking ──────────────────────────────────────────────────────

    handleConfirmBooking() {
        this.isLoading = true;
        const crewIds = this.crew.map(m => m.id);

        createSession({
            boatId: this.selectedBoat.id,
            sessionType: this.selectedSessionType,
            sessionDate: this.todayApexDate,
            crewRowerIds: crewIds,
        })
            .then(sessionId => {
                this.showModal = false;
                this.showToast('Booking confirmed!', `${this.selectedBoat.name} is booked for the ${this.selectedSessionType} session.`, 'success');

                // Populate active session (in-memory only — see limitation note at top)
                this.activeSession = {
                    sessionId: sessionId,
                    boatId: this.selectedBoat.id,
                    boatName: this.selectedBoat.name,
                    sessionType: this.selectedSessionType,
                    status: 'Booked',
                };

                // Refresh boat list to remove the just-booked boat
                this.loadBoats();
            })
            .catch(error => {
                this.showToast('Booking failed', this.extractError(error), 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ─── Active session helpers ───────────────────────────────────────────────

    get isSessionBooked() {
        return this.activeSession && this.activeSession.status === 'Booked';
    }

    get isSessionInProgress() {
        return this.activeSession && this.activeSession.status === 'In Progress';
    }

    handleStartSession() {
        this.isLoading = true;
        startSession({ sessionId: this.activeSession.sessionId })
            .then(() => {
                this.activeSession = { ...this.activeSession, status: 'In Progress' };
                this.showToast('Session started!', `Your ${this.activeSession.sessionType} session has started. Good luck on the water!`, 'success');
            })
            .catch(error => {
                this.showToast('Error', this.extractError(error), 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ─── Issue form ───────────────────────────────────────────────────────────

    get issueTypeOptions() {
        return [
            { value: 'Broken Oar',   label: 'Broken Oar'   },
            { value: 'Hull Damage',  label: 'Hull Damage'   },
            { value: 'Rudder Issue', label: 'Rudder Issue'  },
            { value: 'Seat Issue',   label: 'Seat Issue'    },
            { value: 'Other',        label: 'Other'         },
        ];
    }

    get severityOptions() {
        return [
            { value: 'Minor',    label: 'Minor'    },
            { value: 'Major',    label: 'Major'    },
            { value: 'Critical', label: 'Critical' },
        ];
    }

    handleShowIssueForm() {
        this.showIssueForm = true;
        this.selectedIssueTypes = [];
        this.issueDescription = '';
        this.issueSeverity = 'Minor';
    }

    handleCancelIssueForm() {
        this.showIssueForm = false;
    }

    handleIssueTypeChange(event) {
        const value = event.target.value;
        if (event.target.checked) {
            this.selectedIssueTypes = [...this.selectedIssueTypes, value];
        } else {
            this.selectedIssueTypes = this.selectedIssueTypes.filter(v => v !== value);
        }
    }

    handleIssueDescriptionChange(event) {
        this.issueDescription = event.detail.value;
    }

    handleSeverityChange(event) {
        this.issueSeverity = event.detail.value;
    }

    handleSubmitAndEndSession() {
        this.isLoading = true;
        const { sessionId, boatId } = this.activeSession;

        const reportAndEnd = () =>
            endSession({ sessionId })
                .then(() => {
                    this.activeSession = null;
                    this.showIssueForm = false;
                    this.showToast('Session ended', 'Your session has been completed. Well rowed!', 'success');
                    this.loadBoats();
                });

        if (this.selectedIssueTypes.length > 0) {
            reportIssue({
                sessionId,
                boatId,
                issueTypes: this.selectedIssueTypes.join(';'),
                description: this.issueDescription,
                severity: this.issueSeverity,
            })
                .then(() => reportAndEnd())
                .catch(error => {
                    this.showToast('Error reporting issue', this.extractError(error), 'error');
                    this.isLoading = false;
                });
        } else {
            reportAndEnd()
                .catch(error => {
                    this.showToast('Error ending session', this.extractError(error), 'error');
                })
                .finally(() => {
                    this.isLoading = false;
                });
        }
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    extractError(error) {
        if (error && error.body && error.body.message) {
            return error.body.message;
        }
        if (error && error.message) {
            return error.message;
        }
        return 'An unexpected error occurred.';
    }
}
