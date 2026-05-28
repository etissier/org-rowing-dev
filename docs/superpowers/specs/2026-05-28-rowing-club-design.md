# Rowing Club Boat Management — Design Spec

**Date:** 2026-05-28  
**Phase:** Phase 1 (Option A: Custom Objects + LWC). Agentforce is Phase 2.

---

## Overview

A Salesforce application for a rowing club to manage its fleet of boats, book sessions, track crew, and report post-session issues. Two audiences: **rowers** (book boats quickly, report issues) and **staff** (monitor the full fleet).

---

## Data Model

### Boat__c
| Field | Type | Notes |
|---|---|---|
| Name | Text | Boat name e.g. "Cygne" |
| Capacity__c | Picklist | 1, 2, 4, 8 |
| Number_of_Oars__c | Number | |
| Status__c | Picklist | Available, In Use, Under Repair |
| Restricted_Groups__c | Multi-Select Picklist | Competition Junior; Master; Leisure — groups that CANNOT use this boat |
| Notes__c | Text Area | |

### Rower__c
| Field | Type | Notes |
|---|---|---|
| User__c | Lookup → User | One Rower per SF User |
| Group__c | Picklist | Competition Junior, Master, Leisure |
| License_Number__c | Text | |

### Rowing_Session__c
| Field | Type | Notes |
|---|---|---|
| Boat__c | Lookup → Boat__c | |
| Booked_By__c | Lookup → Rower__c | Person who made the booking |
| Session_Type__c | Picklist | Morning, Afternoon |
| Session_Date__c | Date | |
| Status__c | Picklist | Booked, In Progress, Completed |
| Start_Time__c | DateTime | Set when session starts |
| End_Time__c | DateTime | Set when session ends |

### Session_Member__c (junction)
| Field | Type | Notes |
|---|---|---|
| Session__c | Master-Detail → Rowing_Session__c | |
| Rower__c | Lookup → Rower__c | |

### Boat_Issue__c
| Field | Type | Notes |
|---|---|---|
| Session__c | Lookup → Rowing_Session__c | |
| Boat__c | Lookup → Boat__c | |
| Issue_Type__c | Multi-Select Picklist | Broken Oar; Hull Damage; Rudder Issue; Seat Issue; Other |
| Description__c | Long Text Area | Free-text details |
| Severity__c | Picklist | Minor, Major, Critical |
| Reported_By__c | Lookup → Rower__c | |
| Resolved__c | Checkbox | |

---

## Components

### 1. Rower Booking LWC (`rowingBookingScreen`)

**Audience:** Rowers  
**Placement:** App page or Home page tab

**Flow:**
1. Rower sees current date with Morning / Afternoon toggle
2. Capacity filter buttons (All / 1 / 2 / 4 / 8)
3. List of available boats — filtered to exclude boats with `Restricted_Groups__c` containing the rower's group
4. Rower selects a boat → crew picker opens (search Rower__c, add up to capacity-1 members as pills)
5. Confirm → creates `Rowing_Session__c` (Status = Booked) + `Session_Member__c` records for all crew
6. Session start: rower clicks "Start Session" → Status = In Progress, Start_Time__c = now
7. Session end: rower clicks "End Session" → Status = Completed, End_Time__c = now → optional issue reporting form

**Issue reporting form (inline, on end):**
- Multi-select picklist for Issue_Type__c
- Free-text Description__c
- Severity picklist
- Submit creates Boat_Issue__c record; if Severity = Critical → Boat__c Status set to Under Repair

### 2. Staff Fleet Dashboard LWC (`rowingFleetDashboard`)

**Audience:** Staff/managers  
**Placement:** App page tab

**Features:**
- Date navigation: ← / → arrows (day by day) + date picker. Future dates greyed out.
- Session tab filter: Morning / Afternoon / All Day
- Summary bar: Available / In Use / Under Repair / Open Issues counts
- Boat table columns: Boat Name, Capacity, Status, Session slot, Crew (booker + count), Issues
- Click row → detail panel or record page showing session + crew + issues
- Staff can manually set Boat__c Status to Under Repair / Available from the dashboard

---

## Permissions

- **Rower profile:** Read/Create on Rowing_Session__c and Session_Member__c (own records only), Read on Boat__c, Create on Boat_Issue__c
- **Staff profile:** Full CRUD on all objects, including Boat__c Status updates
- Two permission sets: `Rowing_Rower` and `Rowing_Staff`

---

## Scope Exclusions (Phase 1)

- No Agentforce / natural language booking (Phase 2)
- No push notifications or reminders
- No recurring session scheduling
- No billing or payment tracking

---

## Phase 2 Note

Agentforce will layer on top of this data model — clean object structure and well-named fields are the foundation for natural-language booking actions.
