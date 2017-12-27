<?php
/*
 * @copyright Copyright (c) 2017, Afterlogic Corp.
 * @license AGPL-3.0 or Afterlogic Software License
 *
 * This code is licensed under AGPLv3 license or Afterlogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

/**
 * @package Api
 */

namespace Aurora\System;

class UserSession
{
	/**
     * @var \MailSo\Cache\CacheClient
     */
    protected $Session = null;
	
	/**
     * @var \MailSo\Cache\CacheClient
     */
	protected $Path = '';
	
	public function __construct()
	{
		$this->Path = Api::DataPath().'/sessions';
		$oSession = \MailSo\Cache\CacheClient::NewInstance();
		$oSessionDriver = \MailSo\Cache\Drivers\File::NewInstance($this->Path);
		$oSessionDriver->bRootDir = true;
		$oSession->SetDriver($oSessionDriver);
		$oSession->SetCacheIndex(Api::Version());

		$this->Session = $oSession;
	}
	
	protected function getList()
	{
		$aResult = array();
		$aItems = scandir($this->Path);
		foreach ($aItems as $sItemName)
		{
			if ($sItemName === '.' or $sItemName === '..')
			{
				continue;
			}
			
			$sItemPath = $this->Path . DIRECTORY_SEPARATOR . $sItemName;
			$aItem = Api::DecodeKeyValues(file_get_contents($sItemPath));
			if (is_array($aItem) && isset($aItem['token']))
			{
				$aResult[$sItemPath] = $aItem;
			}
		}
		
		return $aResult;
	}

	public function Set($aData, $iTime = 0)
	{
		if (!file_exists($this->Path))
		{
			@mkdir($this->Path, 0777);
		}
		$aData['@time'] = $iTime;
		$sAccountHashTable = Api::EncodeKeyValues($aData);
		$sAuthToken = \md5(\microtime(true).\rand(10000, 99999));
		return $this->Session->Set('AUTHTOKEN:'.$sAuthToken, $sAccountHashTable) ? $sAuthToken : '';
	}
	
	public function Get($sAuthToken)
	{
		$mResult = false;
		
		if (strlen($sAuthToken) !== 0) 
		{
			$sKey = $this->Session->get('AUTHTOKEN:'.$sAuthToken);
		}
		if (!empty($sKey) && is_string($sKey)) 
		{
			$mResult = Api::DecodeKeyValues($sKey);
			if (isset($mResult['@time']) && time() > (int)$mResult['@time'] && (int)$mResult['@time'] > 0)
			{
				\Aurora\System\Api::Log('User session expired: ');
				\Aurora\System\Api::LogObject($mResult);
				$this->Delete($sAuthToken);
				$mResult = false;
			}
		}
		
		return $mResult;
	}
	
	public function Delete($sAuthToken)
	{
		$this->Session->Delete('AUTHTOKEN:'.$sAuthToken);
	}
	
	public function DeleteById($iId)
	{
		$aList = $this->getList();
		foreach ($aList as $sKey => $aItem)
		{
			if (isset($aItem['id']) && (int)$aItem['id'] === $iId)
			{
				@unlink($sKey);
			}
		}
	}
}