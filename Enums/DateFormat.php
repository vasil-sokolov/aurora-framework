<?php
/*
 * @copyright Copyright (c) 2017, Afterlogic Corp.
 * @license AGPL-3.0 or Afterlogic Software License
 *
 * This code is licensed under AGPLv3 license or Afterlogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

namespace Aurora\System\Enums;

class DateFormat extends AbstractEnumeration
{
	const DD_MONTH_YYYY = 'DD Month YYYY';
	const MMDDYYYY = 'MM/DD/YYYY';
	const DDMMYYYY = 'DD/MM/YYYY';
	const MMDDYY = 'MM/DD/YY';
	const DDMMYY = 'DD/MM/YY';

	/**
	 * @var array
	 */
	protected $aConsts = array(
		'DD Month YYYY' => self::DD_MONTH_YYYY,
		'MM/DD/YYYY' => self::MMDDYYYY,
		'DD/MM/YYYY' => self::DDMMYYYY,
		'MM/DD/YY' => self::MMDDYY,
		'DD/MM/YY' => self::DDMMYY
	);
}
