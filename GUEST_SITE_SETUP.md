# Rowing Club Guest Site Setup

This guide explains how to create a public Experience Cloud site for viewing the Fleet Dashboard.

## Profile Information

**Guest User Profile Name**: Rowing Club Guest Portal Profile
**Guest User Profile URL**: https://storm-b8e919cd90bffa.my.salesforce-setup.com/lightning/setup/EnhancedProfiles/page?address=%2F00eKB0000016twc
**Profile ID**: `00eKB0000016twc`

## What's Been Created

1. **FleetDashboardGuestController** - Guest-accessible Apex controller (`without sharing`)
2. **rowingFleetDashboardGuest** - LWC component exposed for Experience Cloud
3. **Rowing_Guest** - Permission set with read-only access to all required objects

## Deployment Steps

### 1. Deploy the Metadata

```bash
# Deploy to your org
sf project deploy start --source-dir force-app/main/default

# Or deploy specific components
sf project deploy start --metadata ApexClass:FleetDashboardGuestController,PermissionSet:Rowing_Guest,LightningComponentBundle:rowingFleetDashboardGuest
```

### 2. Create the Experience Cloud Site

1. Go to **Setup → Digital Experiences → All Sites**
2. Click **New**
3. Select **Build Your Own (LWR)** template
4. Fill in:
   - **Name**: Rowing Club Guest Portal
   - **URL**: rowing-guest
5. Click **Create**

### 3. Configure the Guest User Profile

After site creation:

1. Go to **Workspaces → Administration → Preferences**
2. Note the **Guest User Profile** name (e.g., "Rowing Club Guest Portal Profile")
3. Go to **Setup → Profiles**
4. Find and open the Guest User Profile
5. Assign the **Rowing_Guest** permission set:
   - Go to **Setup → Permission Sets**
   - Open **Rowing_Guest**
   - Click **Manage Assignments**
   - Add the guest user

OR manually grant permissions to the Guest User Profile:
- **Object Permissions**: Read access to Boat__c, Rowing_Session__c, Session_Member__c, Boat_Issue__c, Rower__c
- **Apex Class Access**: FleetDashboardGuestController
- **Field-Level Security**: Read access to all fields used by the controller

### 4. Add the Component to the Site

1. In **Experience Builder**, click **Edit**
2. Go to the **Home** page
3. From the component panel, search for **rowingFleetDashboardGuest**
4. Drag it onto the page
5. Click **Publish**

### 5. Restrict Access by IP (Optional)

To limit access to the club's internal network:

1. Find your club's public IP address (visit https://whatismyipaddress.com from a club machine)
2. Go to **Setup → Profiles** → [Guest User Profile]
3. Scroll to **Login IP Ranges**
4. Click **New**
5. Set both **Start IP** and **End IP** to your club's IP address
6. **Save**

**Example:**
- Start IP Address: `203.0.113.45`
- End IP Address: `203.0.113.45`

For an IP range:
- Start IP Address: `203.0.113.1`
- End IP Address: `203.0.113.255`

### 6. Test the Site

1. Copy the site URL from **Workspaces → Administration → Settings**
2. Open it in an incognito/private browser window (to test as guest)
3. Verify the Fleet Dashboard loads and displays boats correctly
4. Ensure no edit/update functionality is available

## Site Features

- **Read-only view** of all boats and their status
- **Filter by date** and session type
- **Real-time status** - Available, In Use, Under Repair
- **Crew information** for active sessions
- **Open issues** display with severity
- **Mobile-responsive** design

## Troubleshooting

### "Insufficient privileges" error
- Ensure the Guest User Profile has the Rowing_Guest permission set assigned
- Verify FleetDashboardGuestController is set to `without sharing`
- Check that all required objects have Read permission in the Guest User Profile

### Component not visible in Experience Builder
- Verify the component's `.js-meta.xml` includes these targets:
  ```xml
  <target>lightningCommunity__Page</target>
  <target>lightningCommunity__Default</target>
  ```

### IP restriction not working
- Confirm you're using the **public IP** (not 192.168.x.x or 10.x.x.x)
- Test from outside the restricted IP to verify blocking works
- Check that the IP range is saved on the correct Guest User Profile

## Security Notes

- The controller uses `without sharing` to allow guest access
- Only read operations are exposed - no create/update/delete
- Sensitive fields (user emails, personal data) are not displayed
- IP restrictions provide an additional security layer
- Consider enabling HTTPS enforcement in site settings

## Future Enhancements

- Add auto-refresh for live updates
- Display historical session data
- Add weather integration
- Email notifications for maintenance issues
