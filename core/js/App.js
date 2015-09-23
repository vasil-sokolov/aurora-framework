'use strict';

var
	_ = require('underscore'),
	$ = require('jquery'),
	
	Utils = require('core/js/utils/Common.js'),
	Settings = require('core/js/Settings.js'),
	Screens = require('core/js/Screens.js'),
	Routing = require('core/js/Routing.js'),
	WindowOpener = require('core/js/WindowOpener.js'),
	Browser = require('core/js/Browser.js'),
	
	bMobileDevice = false,
	bMobileApp = false
;

require('core/js/splitter.js'); // necessary in mail and contacts modules, not for mobile version
require('core/js/koBindings.js');
require('core/js/koExtendings.js');

if (!bMobileDevice && !bMobileApp)
{
	require('core/js/customTooltip.js');
	require('core/js/koBindingsNotMobile.js');
}

require('core/js/enums.js');

function CApp()
{
	this.bAuth = window.pSevenAppData.Auth;
}

CApp.prototype.init = function ()
{
	if (this.bAuth)
	{
		var Accounts = require('modules/Mail/js/AccountList.js');
		this.currentAccountId = Accounts.currentId;
		this.defaultAccountId = Accounts.defaultId;
		this.hasAccountWithId = _.bind(Accounts.hasAccountWithId, Accounts);
		this.currentAccountId.valueHasMutated();
		this.currentAccountEmail = ko.computed(function () {
			var oAccount = Accounts.getAccount(this.currentAccountId());
			return oAccount ? oAccount.email() : '';
		}, this);
	}
	
	Screens.init(this.bAuth);
	Routing.init();
	
	require('core/js/AppTab.js');
};

CApp.prototype.isAuth = function ()
{
	return this.bAuth;
};

/**
 * @param {number=} iLastErrorCode
 */
CApp.prototype.logout = function (iLastErrorCode)
{
	var
		Ajax = require('core/js/Ajax.js'),
		oParameters = {'Action': 'SystemLogout'}
	;
	
	if (iLastErrorCode)
	{
		oParameters.LastErrorCode = iLastErrorCode;
	}
	
	Ajax.send(oParameters, this.onLogout, this);
	
	this.bAuth = false;
};

CApp.prototype.authProblem = function ()
{
	this.logout(Enums.Errors.AuthError);
};

CApp.prototype.onLogout = function ()
{
	WindowOpener.closeAll();
	
	Routing.finalize();
	
	if (Utils.isNonEmptyString(Settings.CustomLogoutUrl))
	{
		window.location.href = Settings.CustomLogoutUrl;
	}
	else
	{
		Utils.clearAndReloadLocation(Browser.ie8AndBelow, true);
	}
};

var App = new CApp();

module.exports = App;