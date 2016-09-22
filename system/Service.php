<?php
/*
 * @copyright Copyright (c) 2016, Afterlogic Corp.
 * @license AGPL-3.0
 *
 * This code is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License, version 3,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License, version 3,
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 * 
 */

namespace System;

/**
 * @category Core
 */
class Service
{
	/**
	 * @type string
	 */
	const AUTH_TOKEN_KEY = 'AuthToken';
	
	/**
	 * @var CApiModuleManager
	 */
	protected $oModuleManager;

	/**
	 * @return void
	 */
	protected function __construct()
	{
		$this->oModuleManager = \CApi::GetModuleManager();

//		\MailSo\Config::$FixIconvByMbstring = false;
		\MailSo\Config::$SystemLogger = \CApi::MailSoLogger();
		\MailSo\Config::$PreferStartTlsIfAutoDetect = !!\CApi::GetConf('labs.prefer-starttls', true);
	}

	/**
	 * @return \System\Service
	 */
	public static function NewInstance()
	{
		return new self();
	}
	
	public function GetVersion()
	{
		$sVersion = @file_get_contents(PSEVEN_APP_ROOT_PATH.'VERSION');
		define('PSEVEN_APP_VERSION', $sVersion);
		return $sVersion;
	}
	
	public function CheckApi()
	{
		if (!class_exists('\\CApi') || !\CApi::IsValid()) {
			echo 'AfterLogic API';
			return '';
		}
	}
	
	public function RedirectToHttps()
	{
		$oSettings =& \CApi::GetSettings();
		$bRedirectToHttps = $oSettings->GetConf('RedirectToHttps');
		
		$bHttps = ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== "off") || 
				(isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == "443"));
		if ($bRedirectToHttps && !$bHttps) {
			header("Location: https://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI']);
		}
	}
	
	public static function GetPaths()
	{
		$aResult = array();
		$aQuery = array();
		
		$oHttp = \MailSo\Base\Http::SingletonInstance();
		$aPathInfo = array_filter(explode('/', \trim(\trim($oHttp->GetServer('PATH_INFO', ''), '/'))));
		if (0 < count($aPathInfo)) {
			$aQuery = $aPathInfo;
		} else {
			$sQuery = \trim(\trim($oHttp->GetQueryString()), ' /');

			\CApi::Plugin()->RunQueryHandle($sQuery);

			$iPos = \strpos($sQuery, '&');
			if (0 < $iPos) {
				$sQuery = \substr($sQuery, 0, $iPos);
			}
			$aQuery = explode('/', $sQuery);
		}
		foreach ($aQuery as $sQueryItem) {
			$iPos = \strpos($sQueryItem, '=');
			$aResult[] = (!$iPos) ? $sQueryItem : \substr($sQueryItem, 0, $iPos);
		}
		
		return $aResult;
	}
			
	/**
	 * @param string $sHelpdeskHash = ''
	 * @param string $sCalendarPubHash = ''
	 * @param string $sFileStoragePubHash = ''
	 * @return string
	 */
	private function generateHTML()
	{
		$sResult = '';
		
		$oApiIntegrator = \CApi::GetSystemManager('integrator');
		
		if ($oApiIntegrator) 
		{
			$sModuleHash = '';
			$oModuleManager = \CApi::GetModuleManager();
			$oModuleManager->broadcastEvent('System', 'GenerateHTML', array(&$sModuleHash));
					
			@\header('Content-Type: text/html; charset=utf-8', true);
			
			if (!strpos(strtolower($_SERVER['HTTP_USER_AGENT']), 'firefox')) 
			{
				@\header('Last-Modified: '.\gmdate('D, d M Y H:i:s').' GMT');
			}
			
			if ((\CApi::GetConf('labs.cache-ctrl', true) && isset($_COOKIE['aft-cache-ctrl']))) 
			{
				setcookie('aft-cache-ctrl', '', time() - 3600);
				\MailSo\Base\Http::SingletonInstance()->StatusHeader(304);
				exit();
			}
			
			$oCoreWebclientModule = \CApi::GetModule('CoreWebclient');
			if ($oCoreWebclientModule instanceof \AApiModule) 
			{
				$sResult = file_get_contents($oCoreWebclientModule->GetPath().'/templates/Index.html');
				if (is_string($sResult)) 
				{
					$sFrameOptions = \CApi::GetConf('labs.x-frame-options', '');
					if (0 < \strlen($sFrameOptions)) 
					{
						@\header('X-Frame-Options: '.$sFrameOptions);
					}
					
					$sResult = strtr($sResult, array(
						'{{AppVersion}}' => PSEVEN_APP_VERSION,
						'{{IntegratorDir}}' => $oApiIntegrator->isRtl() ? 'rtl' : 'ltr',
						'{{IntegratorLinks}}' => $oApiIntegrator->buildHeadersLink(),
						'{{IntegratorBody}}' => $oApiIntegrator->buildBody($sModuleHash)
					));
				}
			}
		}

		return $sResult;
	}

	/**
	 * @return void
	 */
	public function Handle()
	{
		$mResult = '';
		$bError = false;
		
		$this->GetVersion();
		$this->CheckApi();
		$this->RedirectToHttps();

		$aPaths = $this->GetPaths();

		$aModules = array();
		if (0 < count($aPaths) && !empty($aPaths[0])) 
		{
			$sEntry = strtolower($aPaths[0]);
			$oModule = $this->oModuleManager->GetModuleFromRequest();
			if ($oModule instanceof \AApiModule) 
			{
				if ($oModule->HasEntry($sEntry))
				{
					$aModules[] = $oModule;
				}
				else 
				{
					$mResult = '\'' . $sEntry . '\' entry not found in \'' . $oModule->GetName() . '\' module.';
					$bError = true;
				}
			}
			else
			{
				$aModules = $this->oModuleManager->GetModulesByEntry($sEntry);
			}
			if (!$bError)
			{
				if (count($aModules) > 0)
				{
					foreach ($aModules as $oModule)
					{
						$mResult .= $oModule->RunEntry($sEntry);
					}
				}
				else 
				{
					$mResult = $this->generateHTML();	
				}
			}
		} 
		else 
		{
			$mResult = $this->generateHTML();
		}
		$oHttp = \MailSo\Base\Http::SingletonInstance();
		if ($oHttp->GetRequest('Format') !== 'Raw')
		{
			echo $mResult;
		}
	}
}
