<?php
/*
 * @copyright Copyright (c) 2017, Afterlogic Corp.
 * @license AGPL-3.0 or Afterlogic Software License
 *
 * This code is licensed under AGPLv3 license or Afterlogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

namespace Aurora\System;

/**
 * @category Core
 */
class Application
{
	/**
	 * @type string
	 */
	const AUTH_TOKEN_KEY = 'AuthToken';
	
	/**
	 * @var \Aurora\System\Module\Manager
	 */
	protected $oModuleManager;

	/**
	 * @return void
	 */
	protected function __construct()
	{
		$this->oModuleManager = Api::GetModuleManager();

//		\MailSo\Config::$FixIconvByMbstring = false;
		\MailSo\Config::$SystemLogger = Api::SystemLogger();
	}

	/**
	 * @return \Aurora\System\Application
	 */
	public static function NewInstance()
	{
		return new self();
	}
	
	/**
	 * @return \Aurora\System\Application
	 */
	public static function SingletonInstance()
	{
		static $oInstance = null;
		if (null === $oInstance)
		{
			$oInstance = self::NewInstance();
		}

		return $oInstance;
	}
	
	public static function DebugMode($bDebug)
	{
		Api::$bDebug = $bDebug;
	}
	
	public static function UseDbLogs()
	{
		Api::$bUseDbLog = true;
	}
	
	public static function Start($sDefaultEntry = 'default')
	{
		try
		{
			Api::Init();
		}
		catch (\Aurora\System\Exceptions\ApiException $oEx)
		{
			\Aurora\System\Api::LogException($oEx);
			echo $oEx->getMessage() . '<br/>';
		}
		
		self::RedirectToHttps();
		self::GetVersion();

		self::SingletonInstance()->oModuleManager->RunEntry(
			\strtolower(self::GetPathItemByIndex(0, $sDefaultEntry))
		);
	}

	/**
	 * @return string
	 */
	public static function GetVersion()
	{
		$sVersion = @\file_get_contents(AU_APP_ROOT_PATH.'VERSION');
		\define('AU_APP_VERSION', $sVersion);
		return $sVersion;
	}
	
	public static function RedirectToHttps()
	{
		$oSettings =& Api::GetSettings();
		$bRedirectToHttps = $oSettings->GetConf('RedirectToHttps');
		
		$bHttps = ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== "off") || 
				(isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == "443"));
		if ($bRedirectToHttps && !$bHttps) 
		{
			\header("Location: https://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI']);
		}
	}
	
	/**
	 * @return array
	 */
	public static function GetPaths()
	{
		static $aResult = null;
		if ($aResult === null)
		{
			$aResult = array();
			$aQuery = array();

			$oHttp = \MailSo\Base\Http::SingletonInstance();
			
			//temporary remove code below, need to remove it late if everything works fine
			// $aPathInfo = \array_filter(
				// \explode('/', \trim(\trim($oHttp->GetServer('PATH_INFO', ''), '/')))
			// );
			// if (0 < \count($aPathInfo)) 
			// {
				// $aQuery = $aPathInfo;
			// } 
			// else 
			// {
				$sQuery = \trim(\trim($oHttp->GetQueryString()), ' /');

				$iPos = \strpos($sQuery, '&');
				if (0 < $iPos) 
				{
					$sQuery = \substr($sQuery, 0, $iPos);
				}
				$aQuery = \explode('/', $sQuery);
			// }
			foreach ($aQuery as $sQueryItem) 
			{
				$iPos = \strpos($sQueryItem, '=');
				$aResult[] = (!$iPos) ? $sQueryItem : \substr($sQueryItem, 0, $iPos);
			}
		}
		
		return $aResult;
	}
	
	/**
	 * 
	 * @param int $iIndex
	 */
	public static function GetPathItemByIndex($iIndex, $mDefaultValue = null)
	{
		$aPath = self::GetPaths();
		
		return !empty($aPath[$iIndex]) ? $aPath[$iIndex] : $mDefaultValue;
	}
}
