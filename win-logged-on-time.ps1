if ($wmiEvent.EventCode -eq 4624) { 
    #By default, remote interactive logon entries will not be collected. 
    #2 - Interactive Logon; 10 - RemoteInteractive Logon 
    if ($IncludeRemoteInteractive) { 
        $logonTypeFlag = ($wmiEvent.InsertionStrings[8] -match "2|10") 
    } else { 
        $logonTypeFlag = ($wmiEvent.InsertionStrings[8] -eq "2") 
    } 
    #Keep user logon event entries only 
    if (($wmiEvent.InsertionStrings[4].Length -gt 12) -and $logonTypeFlag) { 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "EventCode" -Value $($wmiEvent.EventCode) 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TimeGenerated" -Value $dtTimeGenerated 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetUserID" -Value $($wmiEvent.InsertionStrings[4]) 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetUserName" -Value $($wmiEvent.InsertionStrings[5]) 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetDomainName" -Value $($wmiEvent.InsertionStrings[6]) 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetLogonID" -Value $($wmiEvent.InsertionStrings[7]) 
        #Translate logon type from number to meaningful words 
        if ($wmiEvent.InsertionStrings[8] -ne "") { 
            Switch ($wmiEvent.InsertionStrings[8]) { 
                2 {$rawEntry | Add-Member -MemberType NoteProperty -Name "TargetLogonType" -Value "Interactive"} 
                10 {$rawEntry | Add-Member -MemberType NoteProperty -Name "TargetLogonType" -Value "RemoteInteractive"} 
                Default {$rawEntry | Add-Member -MemberType NoteProperty -Name "TargetLogonType" -Value $($wmiEvent.InsertionStrings[8])} 
            } 
            #Add each logon event entry to the temporary array object 
            $rawEntries += $rawEntry 
        } else { 
            $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetLogonType" -Value "N/A" 
        } 
    } 
} elseif ($wmiEvent.EventCode -eq 4647) { 
    if (($wmiEvent.InsertionStrings[0].Length -gt 12)) { 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "EventCode" -Value $($wmiEvent.EventCode) 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TimeGenerated" -Value $dtTimeGenerated 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetUserID" -Value $($wmiEvent.InsertionStrings[0]) 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetUserName" -Value $($wmiEvent.InsertionStrings[1]) 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetDomainName" -Value $($wmiEvent.InsertionStrings[2]) 
        $rawEntry | Add-Member -MemberType NoteProperty -Name "TargetLogonID" -Value $($wmiEvent.InsertionStrings[3]) 
        $rawEntries += $rawEntry 
    } 
} 