<?php

/* -AFTERLOGIC LICENSE HEADER- */

/**
 * @property int $IdChannel
 * @property string $Login
 * @property string $Password
 * @property string $Description
 *
 * @package Channels
 * @subpackage Classes
 */
class CChannel extends api_APropertyBag
{
	public function __construct($sModule)
	{
		parent::__construct(get_class($this), $sModule);

		$this->__USE_TRIM_IN_STRINGS__ = true;
		
		$this->SetDefaults();
		
		$this->SetDefaults(array(
			'IdChannel'		=> 0,
			'Login'			=> '',
			'Password'		=> '',
			'Description'	=> ''
		));
		
		//TODO
//		$this->SetLower(array('Login'));
	}
	
	public static function createInstanse($sModule = 'Core')
	{
		return new CChannel($sModule);
	}
	
	/**
	 * @return array
	 */
	public function getMap()
	{
		return self::getStaticMap();
	}
	
	/**
	 * @return array
	 */
	public static function getStaticMap()
	{
		return array(
			'Login'			=> array('string', ''),
			'Password'		=> array('string', ''),
			'Description'	=> array('string', '')
		);
	}

	/**
	 * @throws CApiValidationException
	 *
	 * @return bool
	 */
	public function validate()
	{
		switch (true)
		{
			case !api_Validate::IsValidChannelLogin($this->Login):
				throw new CApiValidationException(Errs::Validation_InvalidTenantName);
			case api_Validate::IsEmpty($this->Login):
				throw new CApiValidationException(Errs::Validation_FieldIsEmpty, null, array(
					'{{ClassName}}' => 'CChannel', '{{ClassField}}' => 'Login'));
		}

		return true;
	}
}
