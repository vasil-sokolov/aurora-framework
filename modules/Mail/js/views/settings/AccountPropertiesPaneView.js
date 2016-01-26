'use strict';

var
	_ = require('underscore'),
	ko = require('knockout'),
	
	TextUtils = require('core/js/utils/Text.js'),
	Utils = require('core/js/utils/Common.js'),
	
	Api = require('core/js/Api.js'),
	Screens = require('core/js/Screens.js'),
	ModulesManager = require('core/js/ModulesManager.js'),
	CAbstractSettingsFormView = ModulesManager.run('Settings', 'getAbstractSettingsFormViewClass'),
	
	Popups = require('core/js/Popups.js'),
	ChangePasswordPopup = ModulesManager.run('ChangePassword', 'getChangePasswordPopup'),
	
	Accounts = require('modules/Mail/js/AccountList.js'),
	Ajax = require('modules/Mail/js/Ajax.js'),
	Settings = require('modules/Mail/js/Settings.js'),
	CServerPropertiesViewModel = require('modules/Mail/js/views/CServerPropertiesViewModel.js')
;

/**
 * @constructor
 */ 
function CAccountPropertiesPaneView()
{
	CAbstractSettingsFormView.call(this, 'Mail');
	
	this.bAllowChangeEmailSettings =  Settings.AllowUsersChangeEmailSettings;
	this.bAllowIdentities = Settings.AllowIdentities;
	
	this.isInternal = ko.observable(true);
	this.isLinked = ko.observable(true);
	this.isDefault = ko.observable(false);
	this.removeHint = ko.observable('');
	this.canBeRemoved = ko.observable('');
	this.friendlyName = ko.observable('');
	this.email = ko.observable('');
	this.incomingMailLogin = ko.observable('');
	this.incomingMailPassword = ko.observable('');
	this.oIncoming = new CServerPropertiesViewModel(143, 993, 'acc_edit_incoming', TextUtils.i18n('SETTINGS/ACCOUNT_PROPERTIES_INCOMING_MAIL'));
	this.outgoingMailLogin = ko.observable('');
	this.outgoingMailPassword = ko.observable('');
	this.oOutgoing = new CServerPropertiesViewModel(25, 465, 'acc_edit_outgoing', TextUtils.i18n('SETTINGS/ACCOUNT_PROPERTIES_OUTGOING_MAIL'), this.oIncoming.server);

	this.isAllowMail = ko.observable(true);
	this.allowChangePassword = ko.observable(false);
	this.useSmtpAuthentication = ko.observable(false);
	
	this.incLoginFocused = ko.observable(false);
	this.incLoginFocused.subscribe(function () {
		if (this.incLoginFocused() && this.incomingMailLogin() === '')
		{
			this.incomingMailLogin(this.email());
		}
	}, this);

	Accounts.editedId.subscribe(function () {
		this.populate();
	}, this);
	this.populate();
}

_.extendOwn(CAccountPropertiesPaneView.prototype, CAbstractSettingsFormView.prototype);

CAccountPropertiesPaneView.prototype.ViewTemplate = 'Mail_Settings_AccountPropertiesPaneView';

CAccountPropertiesPaneView.prototype.getCurrentValues = function ()
{
	return [
		this.friendlyName(),
		this.email(),
		this.incomingMailLogin(),
		this.oIncoming.port(),
		this.oIncoming.server(),
		this.oIncoming.ssl(),
		this.outgoingMailLogin(),
		this.oOutgoing.port(),
		this.oOutgoing.server(),
		this.oOutgoing.ssl(),
		this.useSmtpAuthentication()
	];
};

CAccountPropertiesPaneView.prototype.getParametersForSave = function ()
{
	var oAccount = Accounts.getEdited();
	return {
		'AccountID': oAccount.id(),
		'FriendlyName': this.friendlyName(),
		'Email': this.email(),
		'IncomingMailLogin': this.incomingMailLogin(),
		'IncomingMailServer': this.oIncoming.server(),
		'IncomingMailPort': this.oIncoming.getIntPort(),
		'IncomingMailSsl': this.oIncoming.getIntSsl(),
		'OutgoingMailLogin': this.outgoingMailLogin(),
		'OutgoingMailServer': this.oOutgoing.server(),
		'OutgoingMailPort': this.oOutgoing.getIntPort(),
		'OutgoingMailSsl': this.oOutgoing.getIntSsl(),
		'OutgoingMailAuth': this.useSmtpAuthentication() ? 2 : 0,
		'IncomingMailPassword': this.incomingMailPassword()
	};
};

CAccountPropertiesPaneView.prototype.populate = function ()
{
	var oAccount = Accounts.getEdited();
	
	if (oAccount)
	{	
		this.allowChangePassword(!!ChangePasswordPopup);// && oAccount.extensionExists('AllowChangePasswordExtension'));

		this.friendlyName(oAccount.friendlyName());
		this.email(oAccount.email());
		this.incomingMailLogin(oAccount.incomingMailLogin());
		this.oIncoming.set(oAccount.incomingMailServer(), oAccount.incomingMailPort(), oAccount.incomingMailSsl());
		this.outgoingMailLogin(oAccount.outgoingMailLogin());
		this.oOutgoing.set(oAccount.outgoingMailServer(), oAccount.outgoingMailPort(), oAccount.outgoingMailSsl());
		this.useSmtpAuthentication(Utils.pInt(oAccount.outgoingMailAuth()) === 2 ? true : false);
		
		this.isInternal(oAccount.isInternal());
		this.isLinked(oAccount.isLinked());
		this.isDefault(oAccount.isDefault());
		this.removeHint(oAccount.removeHint());
		this.canBeRemoved(oAccount.canBeRemoved());
	}
	else
	{
		this.allowChangePassword(false);

		this.friendlyName('');
		this.email('');
		this.incomingMailLogin('');
		this.oIncoming.clear();
		this.outgoingMailLogin('');
		this.oOutgoing.clear();
		this.useSmtpAuthentication(true);
		
		this.isInternal(true);
		this.isLinked(true);
		this.isDefault(true);
		this.removeHint('');
		this.canBeRemoved(false);
	}

	this.updateSavedState();
};

CAccountPropertiesPaneView.prototype.save = function ()
{
	this.isSaving(true);
	
	this.updateSavedState();
	
	Ajax.send('UpdateAccount', this.getParametersForSave(), this.onResponse, this);
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CAccountPropertiesPaneView.prototype.onResponse = function (oResponse, oRequest)
{
	this.isSaving(false);

	if (!oResponse.Result)
	{
		Api.showErrorByCode(oResponse, TextUtils.i18n('SETTINGS/ERROR_SETTINGS_SAVING_FAILED'));
	}
	else
	{
		var
			iAccountId = Utils.pInt(oResponse.AccountID),
			oAccount = Accounts.getAccount(iAccountId),
			oParameters = JSON.parse(oRequest.Parameters)
		;

		if (oAccount)
		{
			oAccount.updateExtended(oParameters);
			Screens.showReport(TextUtils.i18n('SETTINGS/COMMON_REPORT_UPDATED_SUCCESSFULLY'));
		}
	}
};

CAccountPropertiesPaneView.prototype.changePassword = function ()
{
	if (ChangePasswordPopup)
	{
		Popups.showPopup(ChangePasswordPopup, [{
			sModule: 'Mail',
			bHasOldPassword: true
		}]);
	}
};

module.exports = new CAccountPropertiesPaneView();