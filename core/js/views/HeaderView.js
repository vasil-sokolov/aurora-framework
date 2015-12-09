'use strict';

var
	_ = require('underscore'),
	ko = require('knockout'),
	
	Utils = require('core/js/utils/Common.js'),
	App = require('core/js/App.js'),
	ModulesManager = require('core/js/ModulesManager.js'),
	Ajax = require('core/js/Ajax.js'),
	Screens = require('core/js/Screens.js'),
	Routing = require('core/js/Routing.js'),
	Settings = require('core/js/Settings.js'),
	Browser = require('core/js/Browser.js'),
	CAbstractScreenView = require('core/js/views/CAbstractScreenView.js')
;

/**
 * @constructor
 */
function CHeaderView()
{
	CAbstractScreenView.call(this);
	
	this.tabs = ModulesManager.getModulesTabs(false);
	
	ko.computed(function () {
		_.each(this.tabs, function (oTab) {
			if (oTab.isCurrent)
			{
				oTab.isCurrent(Screens.currentScreen() === oTab.sName);
				if (oTab.isCurrent() && Utils.isNonEmptyString(Routing.currentHash()))
				{
					oTab.hash('#' + Routing.currentHash());
				}
			}
		});
	}, this).extend({ rateLimit: 50 });
	
	this.showLogout = App.isAuth() && !App.isPublic();

	this.appCustomLogo = Settings.CustomLogo;
	
	this.mobileDevice = Browser.mobileDevice;
	
//	if (AfterLogicApi.runPluginHook)
//	{
//		AfterLogicApi.runPluginHook('view-model-defined', [this.__name, this]);
//	}
}

_.extendOwn(CHeaderView.prototype, CAbstractScreenView.prototype);

CHeaderView.prototype.ViewTemplate = App.isMobile() ? 'Core_HeaderMobileView' : 'Core_HeaderView';
CHeaderView.prototype.__name = 'CHeaderView';

CHeaderView.prototype.logout = function ()
{
	App.logout();
};

CHeaderView.prototype.switchToFullVersion = function ()
{
	Ajax.send('Core', 'SetMobile', {'Mobile': 0}, function (oResponse) {
		if (oResponse.Result)
		{
			window.location.reload();
		}
	}, this);
};

module.exports = new CHeaderView();